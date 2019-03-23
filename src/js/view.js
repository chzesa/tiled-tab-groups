'use strict';

var bgPage;
var use_tst_indent = false;
var use_tst_move = false;
var use_tst_tree_close = false;
var use_ftt;
// var multiselect_api_enabled = false;
var cmd_que = newSyncQueue();

var view = {
	windowId: -1
	, tabId: -1
	, groupsNode: null
	, stashNode: null
	, dragIndicator: null,

	tabs: {}
};

var WINDOW_ID;
var TAB_ID;
var TABINTERFACE;
var GRPINTERFACE;
var manager;

var out_of_order_groups = {};
var tab_count_recount_groups = {};

var use_indent = false;

async function initView() {
	bgPage = browser.extension.getBackgroundPage();
	view.groupsNode = document.getElementById('groups');
	view.stashNode = document.getElementById('pool');
	pinned = document.getElementById('pinnedTabs');
	tab_node_pool_anchor = document.getElementById('pool');

	WINDOW_ID = (await browser.windows.getCurrent()).id;
	TAB_ID = (await browser.tabs.getCurrent()).id;

	var count = 0;
	while (TABINTERFACE == null) {
		count++;
		if (count > 20) return;
		TABINTERFACE = await bgPage.registerView({
			tabId: TAB_ID
			, windowId: WINDOW_ID
			, onCreated
			, onRemoved
			, onUpdated
			, onMoved
			, onStashed
			, onActivated
			, onGroupCreated
			, onGroupRemoved
			, reorderGroup
			, getSelection: function () {
				let ret = Selected.get();
				Selected.clear();
				return ret;
			}
			, clearSelection: function () {
				Selected.clear();
			}
		});
	}

	GRPINTERFACE = TABINTERFACE.getGroupInterface(WINDOW_ID);

	await Promise.all([
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
		})
	]);

	await fillGroupNodes();
	await setActiveTabNode();

	await TABINTERFACE.forEach(async function (tab) {
		let groupId = await TABINTERFACE.getGroupId(tab.id);

		if (groupId == -1 || GRPINTERFACE.get(groupId) == null ||
			GRPINTERFACE.get(groupId).stash) {
			return;
		}

		updateTabNode(tab);
	}, WINDOW_ID);

	if (use_tst_indent) {
		updateIndent = updateIndentTst;
		use_indent = true;
	}
	else if (use_ftt) {
		updateIndent = updateIndentFtt;
		use_indent = true;
	}

	if (use_indent) {
		TABINTERFACE.forEach(async function (tab) {
			updateIndent(tab.id);
		}, WINDOW_ID)
	}

	view.dragIndicator = new_element('div', {
		class: 'drag_indicator'
	});
	view.groupsNode.appendChild(view.dragIndicator);
	view.groupsNode.addEventListener('dragover', groupDragOver, false);
	view.groupsNode.addEventListener('drop', outsideDrop, false);

	document.getElementById('newGroupButton').addEventListener('click', async function () {
		bgPage.enqueueTask(async function () {
			let group = await GRPINTERFACE.new();
			await onGroupCreated(group.id);
		})
	});

	Selected.init(function () {
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

	manager = newGroupsManager();
}

document.addEventListener('DOMContentLoaded', initView, false);

async function onCreated(tab, groupId) {
	if (GRPINTERFACE.get(groupId).stash) {
		return;
	}

	makeTabNode(tab);

	if (use_indent) {
		updateIndent(tab.id);
	}

	updateTabNode(tab);
	await insertTab(tab, groupId);
	Selected.requireUpdate();
}

function onRemoved(tabId, groupId) {
	deleteTabNode(tabId);
	updateTabCountById(groupId);
}

async function onMoved(tabId, moveInfo) {
	let groupId = TABINTERFACE.getGroupId(tabId);
	if (groupId == null) {
		return;
	}
	await reorderGroup(groupId);

	if (use_indent) {
		updateIndent(tabId);
	}
}

async function onActivated(tabId) {
	if (tabId == TAB_ID) {
		await manager.hide();
		setActiveTabNode();
	}
}

async function onUpdated(tab, info) {
	if (info.pinned == true) {
		makeTabNode(tab);
		partialUpdate(tab, info);

		if (use_indent) {
			updateIndent(tab.id);
		}

		let frag = document.createDocumentFragment();

		TABINTERFACE.forEach(async function (tab) {
			if (tab.pinned) {
				frag.appendChild(tabNodes[tab.id].tab);
			}
		}, WINDOW_ID);

		pinned.appendChild(frag);
	}
	else {
		let groupId = TABINTERFACE.getGroupId(tab.id);
		if (groupId == -1 || GRPINTERFACE.get(groupId).stash) {
			if ('pinned' in info) {
				deleteTabNode(tab.id);
			}

			return;
		}

		partialUpdate(tab, info);

		if ('pinned' in info) {
			await reorderGroup(groupId);
		}
	}
}

async function onStashed(groupId) {
	if (GRPINTERFACE.get(groupId).stash == true) {
		await TABINTERFACE.forEach(function (tab) {
			deleteTabNode(tab.id);
		}, WINDOW_ID, groupId);

		onGroupRemoved(groupId);
	}
	else {
		await onGroupCreated(groupId);
	}

	Selected.requireUpdate();
}

async function onGroupCreated(groupId) {
	let group = GRPINTERFACE.get(groupId);
	if (group.stash) return;
	makeGroupNode(group);
	let frag = document.createDocumentFragment();

	await TABINTERFACE.forEach(function (tab) {
		if (!tab.pinned) {
			frag.appendChild(makeTabNode(tab).tab);
			updateTabNode(tab);
			if (use_indent) {
				updateIndent(tab.id);
			}
		}
	}, WINDOW_ID, groupId);

	setAsNthChild(frag, groupNodes[group.id].content);

	var hidden = 0;
	for (var i = 0; i < group.index; i++) {
		if (GRPINTERFACE.getByIndex(i).stash == true) {
			hidden++;
		}
	}

	setAsNthChild(groupNodes[group.id].group, view.groupsNode, group.index - hidden);
	updateTabCountById(groupId);
}

async function onGroupRemoved(groupId) {
	groupNodes[groupId].group.parentNode.removeChild(groupNodes[groupId].group);
	delete groupNodes[groupId];
	Selected.requireUpdate();
}