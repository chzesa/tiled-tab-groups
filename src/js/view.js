'use strict';

var bgPage;
var use_tst_indent = false;
var use_tst_move = false;
var use_tst_tree_close = false;
var use_ftt;

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

let STATE = {
	drawAllGroups: false
};

let displayAllGroupsButton;

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
		browser.storage.local.get().then(config => {
			use_tst_indent = config.use_tst_indent || false;
			use_tst_move = config.use_tst_move || false;
			use_tst_tree_close = config.use_tst_tree_close || false;
			use_ftt = config.ftt || false;
			switch(config.theme) {
				case ThemeOption.System:
					if (window.matchMedia('(prefers-color-scheme: light)').matches) {
						appendCSSFile('css/color-light.css');
					}
					break;
				case ThemeOption.Dark:
					break;
				case ThemeOption.Light:
					appendCSSFile('css/color-light.css');
					break;
			}

			appendCSS(config.panorama_css);
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
	document.body.appendChild(view.dragIndicator);
	view.groupsNode.addEventListener('dragover', groupDragOver, false);
	view.groupsNode.addEventListener('drop', outsideDrop, false);

	document.getElementById('newGroupButton').addEventListener('click', async function () {
		bgPage.enqueueTask(async function () {
			let group = await GRPINTERFACE.new();
			await onGroupCreated(group.id);
		})
	});

	displayAllGroupsButton = document.getElementById('visibility-toggle-button');
	displayAllGroupsButton.addEventListener('click', () => bgPage.enqueueTask(toggleAllGroupsVisibility));

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

	document.addEventListener('contextmenu', async function (event) {
		bgPage.viewContextShown();
		let cont = event.target.closest('.tab');
		let tabId;
		if (cont == null) {
			if (lastActiveId != -1) {
				tabId = lastActiveId;
			} else {
				return;
			}
		} else {
			tabId = Number(cont.getAttribute('tabId'));
		}
		browser.menus.overrideContext({
			context: 'tab'
			, tabId
		});
	});

	view.groupsNode.addEventListener('mousedown', Selected.startSelect);

	manager = newGroupsManager();

	window.addEventListener("beforeunload", e => {
		bgPage.enqueueTask(bgPage.unregisterView, TAB_ID);
	});

	browser.sessions.getWindowValue(WINDOW_ID, `groupsViewDisplayAllGroups`).then(v => {
		if (v != STATE.drawAllGroups) bgPage.enqueueTask(toggleAllGroupsVisibility);
	});
}

document.addEventListener('DOMContentLoaded', initView, false);

async function toggleAllGroupsVisibility() {
	STATE.drawAllGroups = !STATE.drawAllGroups;
	browser.sessions.setWindowValue(WINDOW_ID, `groupsViewDisplayAllGroups`, STATE.drawAllGroups);
	await fillGroupNodes();
	if (STATE.drawAllGroups) {
		displayAllGroupsButton.style.backgroundImage = `url(icons/eye.svg)`;
		await TABINTERFACE.forEach(async function (tab) {
			updateTabNode(tab);
			if (use_indent) updateIndent(tab.id);
		}, WINDOW_ID);
	} else {
		displayAllGroupsButton.style.backgroundImage = `url(icons/eye-off.svg)`;
	}

}

function isGroupVisible(groupId) {
	return STATE.drawAllGroups || !GRPINTERFACE.get(groupId).stash;
}

function onCreated(tab, groupId) {
	if (!isGroupVisible(groupId)) {
		return;
	}

	makeTabNode(tab);

	if (use_indent) {
		updateIndent(tab.id);
	}

	updateTabNode(tab);
	insertTab(tab, groupId);
	Selected.requireUpdate();
}

function onRemoved(tabId, groupId) {
	deleteTabNode(tabId);
	updateTabCountById(groupId);
}

function onMoved(tabId, moveInfo) {
	let groupId = TABINTERFACE.getGroupId(tabId);
	if (groupId == null) {
		return;
	}
	reorderGroup(groupId);

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

function onUpdated(tab, info) {
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
		let grp = GRPINTERFACE.get(groupId);
		if (groupId == -1 || !isGroupVisible(groupId)) {
			if ('pinned' in info) {
				deleteTabNode(tab.id);
			}

			return;
		}

		partialUpdate(tab, info);

		if ('pinned' in info) {
			reorderGroup(groupId);
		}
	}
}

function onStashed(groupId) {
	let group = GRPINTERFACE.get(groupId);
	let grpNode = makeGroupNode(group);
	setNodeClass(grpNode.group, 'stashed', group.stash);

	if (STATE.drawAllGroups) {
		return;
	}

	if (!isGroupVisible(groupId)) {
		TABINTERFACE.forEach(function (tab) {
			deleteTabNode(tab.id);
		}, WINDOW_ID, function(tab) {
			return groupId == TABINTERFACE.getGroupId(tab.id);
		});

		onGroupRemoved(groupId);
	}
	else {
		onGroupCreated(groupId);
	}

	Selected.requireUpdate();
}

function onGroupCreated(groupId) {
	let group = GRPINTERFACE.get(groupId);
	let grpNode = makeGroupNode(group);
	if (!isGroupVisible(groupId)) {
		view.stashNode.appendChild(grpNode.group);
		return;
	}

	let frag = document.createDocumentFragment();

	TABINTERFACE.forEach(function (tab) {
		if (!tab.pinned) {
			frag.appendChild(makeTabNode(tab).tab);
			updateTabNode(tab);
			if (use_indent) {
				updateIndent(tab.id);
			}
		}
	}, WINDOW_ID, function(tab) {
		return groupId == TABINTERFACE.getGroupId(tab.id);
	});

	let hidden = 0;
	for (let i = 0; i < group.index; i++) {
		if (!isGroupVisible(GRPINTERFACE.getByIndex(i).id)) {
			hidden++;
		}
	}

	setAsNthChild(grpNode.group, view.groupsNode, group.index - hidden);
	updateTabCountById(groupId);
}

function onGroupRemoved(groupId) {
	groupNodes[groupId].group.parentNode.removeChild(groupNodes[groupId].group);
	delete groupNodes[groupId];
	Selected.requireUpdate();
}