'use strict';

var background = browser.extension.getBackgroundPage();
var use_tst_indent = false;
var use_tst_move = false;
var use_tst_tree_close = false;
var use_ftt;
// var multiselect_api_enabled = false;
var cmd_que = newCommandQueue();

var view = {
	windowId: -1
	, tabId: -1
	, groupsNode: null
	, stashNode: null
	, dragIndicator: null,

	tabs: {}
};

var out_of_order_groups = {};
var tab_count_recount_groups = {};

async function initView() {
	view.groupsNode = document.getElementById('groups');
	view.stashNode = document.getElementById('group-pool');

	await Promise.all([
		browser.windows.getCurrent().then(pWindow => {
			view.windowId = pWindow.id;
		}),

		browser.tabs.getCurrent().then(pTab => {
			view.tabId = pTab.id;
		}),

		browser.storage.local.get().then(pValue => {
			use_tst_indent = pValue.use_tst_indent || false;
			use_tst_move = pValue.use_tst_move || false;
			use_tst_tree_close = pValue.use_tst_tree_close || false;
			use_ftt = pValue.ftt || false;
			// multiselect_api_enabled = pValue.multiselect_api_enabled || false;
			if (pValue.light_theme) {
				appendCSSFile('css/color-light.css');
			}

			appendCSS(pValue.panorama_css);


		}),

		groups.init().then(_ => {
			initGroupNodes()
		})
		, initTabNodes()
		, prefetchGroupIds()
	]);

	await Promise.all([
		setActiveTabNode()
		, fillGroupNodes()
	])

	if (use_tst_indent || use_ftt)
	tabs.forEach(tab => {
		updateIndent(tab.id);
	});

	await correctGroupTabCounts();

	cmd_que.onComplete(correctOutOfOrderGroups);
	cmd_que.onComplete(correctGroupTabCounts);

	view.dragIndicator = new_element('div', {
		class: 'drag_indicator'
	});
	view.groupsNode.appendChild(view.dragIndicator);

	// set all listeners
	// browser.tabs.onCreated.addListener(tabCreated);
	browser.tabs.onCreated.addListener(async (tab) => {
		cmd_que.do([tab], tabCreatedCmd);
	});
	// browser.tabs.onRemoved.addListener(tabRemoved);
	browser.tabs.onRemoved.addListener(async (tab, info) => {
		cmd_que.do([tab, info], tabRemovedCmd);
	});

	// browser.tabs.onUpdated.addListener(onTabUpdated);
	browser.tabs.onUpdated.addListener(async (one, two, three) => {
		cmd_que.do([one, two, three], onTabUpdatedCmd, true, false);
	});

	// browser.tabs.onMoved.addListener(tabMoved);
	browser.tabs.onMoved.addListener(async (tab, info) => {
		cmd_que.do([tab, info], tabMovedCmd);
	});

	browser.tabs.onAttached.addListener(tabAttached);
	browser.tabs.onDetached.addListener(tabDetached);

	browser.tabs.onActivated.addListener(tabActivated);

	view.groupsNode.addEventListener('dragover', groupDragOver, false);
	view.groupsNode.addEventListener('drop', outsideDrop, false);

	browser.runtime.onMessage.addListener(handleMessage);

	document.getElementById('newGroupButton').addEventListener('click', async function () {
		commsNewGroup();
	});

	Selected.init(() => {
		let o = {};

		for (let groupId in groupNodes) {
			let children = groupNodes[groupId].content.childNodes;
			let n = children.length;
			for (let i = 0; i < n; i++) {
				let tab = children[i];
				let id = Number(tab.getAttribute('tabId'));
				o[id] = tab;
			}
		}

		return o;
	});

	commsBeacon(view.tabId);
}

async function correctOutOfOrderGroups() {
	let b = false;
	for (let i in out_of_order_groups) {
		b = true;
		await reorderGroup(i);
	}

	if (b) {
		out_of_order_groups = {};
	}
}

async function correctGroupTabCounts() {
	let b = false;
	for (let i in tab_count_recount_groups) {
		b = true;
		updateTabCountById(i);
	}

	if (b) {
		tab_count_recount_groups = {};
	}
}

function markGroupDisorderly(groupId) {
	out_of_order_groups[groupId] = true;
}

function markGroupRecount(groupId) {
	tab_count_recount_groups[groupId] = true;
}

async function handleMessage(request) {
	switch (request.message) {
	case CONTENT_MSG_STASH_GROUP:
		// groupStashed(request.options.id, request.options.state);
		cmd_que.do([request.options.id, request.options.state], groupStashedCmd);
		break;
	case CONTENT_MSG_NEW_GROUP:
		let group = request.options.group;
		makeGroupNode(group);
		view.groupsNode.appendChild(groupNodes[group.id].group);
		break;

	case CONTENT_MSG_TAB_MOVED:
		// updateMovedTab(request.options.id);
		cmd_que.do([request.options.id], updateMovedTabCmd);
		break;

	case CONTENT_MSG_GET_SELECTION:
		return new Promise(resolve => {
			resolve(Selected.get());
			Selected.clear();
		});
		break;

	case CONTENT_MSG_CLEAR_SELECTION:
		Selected.clear();
		break;
	}
}

document.addEventListener('DOMContentLoaded', initView, false);

async function groupStashedCmd(args) {
	await groupStashed(args[0], args[1]);
}

async function groupStashed(groupId, stashed) {
	if (!stashed) {
		setGroupVisible(groupId, true);
		Selected.requireUpdate();
	}
}

async function tabCreatedCmd(args) {
	await tabCreated(args[0], args[1]);
}

async function tabCreated(tab, groupId = undefined) {
	if (view.windowId == tab.windowId) {
		await makeTabNode(tab);
		updateTabNode(tab);
		updateIndent(tab.id);
		updateFavicon(tab);

		cmd_que.do([tab, tabs.getGroupId(tab.id)], insertTabCmd, true);
	}
}

async function tabRemovedCmd(args) {
	await tabRemoved(args[0], args[1]);
}

async function tabRemoved(tabId, removeInfo) {
	if (view.windowId == removeInfo.windowId && view.tabId != tabId) {
		deleteTabNode(tabId);
		groups.forEach(function (group) {
			// updateTabCount(group);
			markGroupRecount(group.id);
		});

		// tabs.forEach(pTab => {
		// 	updateIndent(pTab);
		// })
	}
}

async function onTabUpdatedCmd(args) {
	await onTabUpdated(args[0], args[1], args[2]);
}

async function onTabUpdated(pTabId, pChangeInfo = {}, pTab = {}) {
	if (view.windowId != pTab.windowId) {
		return;
	}

	if ('discarded' in pChangeInfo || 'title' in pChangeInfo) {
		updateTabNode(pTab);
	}

	updateFavicon(pTab);

	if ('pinned' in pChangeInfo) {
		let groupId = await tabs.getGroupId(pTabId);
		let tabNode = tabNodes[pTabId].tab;

		if (pChangeInfo.pinned) {
			fillGroupNodes().then(_ => {
				groupNodes.pinned.content.appendChild(tabNode);
			});
		}
		else {
			let groupContentNode = groupNodes[groupId].content;
			setAsNthChild(tabNode, groupContentNode, 0);
		}

		// updateTabCount(groupId);
		markGroupRecount(groupId)
		updateIndent(pTabId);
	}
}

async function tabMovedCmd(args) {
	await tabMoved(args[0], args[1]);
}

async function tabMoved(tabId, moveInfo) {
	if (moveInfo.windowId == view.windowId) {
		try {
			let id = await tabs.getGroupId(tabId);
			// reorderGroup(id);
			markGroupDisorderly(id);
			markGroupRecount(id);
		}
		catch (e) {
			console.log(e);
		}
	}
}

async function updateMovedTabCmd(args) {
	await (updateMovedTab(args[0]))
}

async function updateMovedTab(pTabId) {
	browser.tabs.get(pTabId).then(async function (tab) {
		await insertTab(tab);
		updateIndent(tab.id)
		groups.forEach(function (group) {
			// updateTabCount(group);
			markGroupRecount(group.id);
		});
	});
}

async function tabAttached(tabId, attachInfo) {
	if (view.windowId == attachInfo.newWindowId) {
		let tab = await browser.tabs.get(tabId);

		tabs.setGroupIdUpdate(tabId, await browser.sessions.getWindowValue(view.windowId, 'activeGroup'));
		tabCreated(tab);
		Selected.requireUpdate();
	}
}

function tabDetached(tabId, detachInfo) {
	if (view.windowId == detachInfo.oldWindowId) {
		deleteTabNode(tabId);
		groups.forEach(function (group) {
			// updateTabCount(group);
			markGroupRecount(group.id);
		});

		// tabs.forEach(pTab => {
		// 	updateIndent(pTab);
		// })
	}
}

async function updateIndentationForTree(pTabId) {
	const kTST_ID = 'treestyletab@piro.sakura.ne.jp';
	let tree = await browser.runtime.sendMessage(kTST_ID, {
		type: 'get-tree'
		, tab: pTabId
	});

	if (tree.ancestorTabIds.length > 0) {
		tree = await browser.runtime.sendMessage(kTST_ID, {
			type: 'get-tree'
			, tab: tree.ancestorTabIds[0]
		});
	}

	forBranchesInTree(pTree, pBranch => {
		updateIndent(pBranch.id);
	});
}

async function forBranchesInTree(pTree, pCallback) {
	pCallback(pTree);

	for (let i = 0; i < pTree.children.length; i++) {
		let tree = pTree.children[i];
		forBranchesInTree(tree);
	}
}

async function tabActivated(activeInfo) {
	if (activeInfo.tabId !== view.tabId) {
		browser.tabs.hide(view.tabId);
	}

	setActiveTabNode();
}

async function printCoordinates() {
	for (let id in tabNodes) {
		console.log(tabNodes[id].tab);
		console.log(tabNodes[id].tab.getBoundingClientRect());
	}
}