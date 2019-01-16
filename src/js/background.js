'use strict';

async function tabCreated(tab) {
	if (!openingView) {

		var tabGroupId = await browser.sessions.getTabValue(tab.id, 'groupId');

		if (tabGroupId === undefined) {

			var activeGroup = undefined;

			while (activeGroup === undefined) {
				activeGroup = (await browser.sessions.getWindowValue(tab.windowId, 'activeGroup'));
			}

			tabs.setGroupId(tab.id, activeGroup);
		}
	}
	else {
		openingView = false;
		tabs.setGroupId(tab.id, -1);
		panoramaTabs[tab.windowId] = tab.id;
		removePanoramaViewTabs();
	}
}

async function setupWindows() {
	const windows = browser.windows.getAll({});

	for (const window of await windows) {

		var groups = await browser.sessions.getWindowValue(window.id, 'groups');

		if (groups === undefined) {
			createGroupInWindow(window);
		}
	}
}

async function newGroupUid(windowId) {
	var groupIndex = (await browser.sessions.getWindowValue(windowId, 'groupIndex'));

	var uid = groupIndex || 0;
	var newGroupIndex = uid + 1;

	await browser.sessions.setWindowValue(windowId, 'groupIndex', newGroupIndex);

	return uid;
}

async function createGroupInWindow(window) {
	var groupId = await newGroupUid(window.id);

	var groups = [{
		id: groupId
		, name: `Group ${groupId}`
		, containerId: 'firefox-default'
		, tabCount: 0, // stash: false,
	}];

	browser.sessions.setWindowValue(window.id, 'groups', groups);
	browser.sessions.setWindowValue(window.id, 'activeGroup', groupId);

	const winTabs = browser.tabs.query({
		windowId: window.id
	});

	for (const tab of await winTabs) {
		tabs.setGroupId(tab.id, groupId);
	}
}

async function salvageGrouplessTabs() {
	let windows = {};
	const _windows = await browser.windows.getAll({});

	for (const w of _windows) {
		windows[w.id] = {
			groups: null
		};
		windows[w.id].groups = await browser.sessions.getWindowValue(w.id, 'groups');
	}

	const browser_tabs = browser.tabs.query({});

	let salvagedGroups = {};

	for (const tab of await browser_tabs) {
		let groupId = await browser.sessions.getTabValue(tab.id, 'groupId');

		if (groupId === undefined || groupId < 0) {
			let activeGroup = await browser.sessions.getWindowValue(tab.windowId, 'activeGroup');
			tabs.setGroupId(tab.id, activeGroup);
		}
		else {
			let groupExists = false;
			for (const group of windows[tab.windowId].groups) {
				if (group.id == groupId) {
					groupExists = true;
					break;
				}
			}
			if (tab.pinned) {
				let activeGroup = await browser.sessions.getWindowValue(tab.windowId, 'activeGroup');
				tabs.setGroupId(tab.id, activeGroup);
			}
			else if (!groupExists) {
				if (salvagedGroups[groupId] === undefined) {
					let sGrp = await groups.create();
					sGrp.name = sGrp.name + " (Salvaged)";
					salvagedGroups[groupId] = sGrp.id;
				}

				tabs.setGroupId(tab.id, salvagedGroups[groupId]);
			}
		}
	}
}

const contextMenuIds = [];

const menuGroupState = {
	active: 0
	, deleted: 1
};

async function updateContextMenu() {
	await groups.init();
	for (let i in contextMenuIds) {
		contextMenuIds[i] = menuGroupState.deleted;
	}

	groups.forEach(group => {
		let id = group.id;
		if (contextMenuIds[id] == null) {
			createContextMenuItem(group);
		}
		else {
			contextMenuIds[id] = menuGroupState.active;
			let params = [`${id}`, {
				title: `${group.name}`
			}];
			browser.menus.update(...params);
			updateTSTContextMenuItem(params);
		}

	});

	for (let i in contextMenuIds) {
		if (contextMenuIds[i] == menuGroupState.deleted) {
			browser.menus.remove(i);
			removeTSTContextMenuItem(i);
		}
	}
}

var use_tst_context = false;

async function createContextMenuItem(group) {
	let id = group.id;
	contextMenuIds[id] = menuGroupState.active;

	let params = {
		id: `${id}`
		, title: `${group.name}`
		, parentId: "root"
	};

	browser.menus.create(params);
	createTSTContextMenuItem(params);
}

// https://github.com/piroor/treestyletab/wiki/API-for-other-addons#extra-context-menu-items-on-tabs
const kTST_ID = 'treestyletab@piro.sakura.ne.jp';

async function updateTSTContextMenuItem(params) {
	await tstContextMenuComms('fake-contextMenu-update', params);
}

async function createTSTContextMenuItem(params) {
	await tstContextMenuComms('fake-contextMenu-create', params);
}

async function removeTSTContextMenuItem(params) {
	await tstContextMenuComms('fake-contextMenu-remove', params);
}

async function tstContextMenuComms(type, params) {
	if (!use_tst_context) {
		return;
	}

	await browser.runtime.sendMessage(kTST_ID, {
		type
		, params
	}).catch(error => { /* TST is not available */ });;
}

// https://github.com/piroor/treestyletab/wiki/API-for-other-addons#register-and-unregister-your-addon-to-tst
async function registerTST() {
	if (!use_tst_context) {
		return;
	}
	await browser.runtime.sendMessage(kTST_ID, {
		type: 'register-self'
		, icons: browser.runtime.getManifest().icons
		, listeningTypes: ['tab-mousedown']
	, }).catch(e => {});
}

async function tabContextMenuAction(pInfo, pTab) {
	await tabs.setGroupIdUpdate(pTab.id, pInfo.menuItemId);

	sendMessageToView(pTab.windowId, CONTENT_MSG_TAB_MOVED, {
		id: pTab.id
	});

	if (pTab.active && pTab.windowId == (await browser.windows.getCurrent()).id) {
		groups.setActive(await tabs.getGroupId(pTab.id));
	}
}

async function panoramaContextMenuAction(pInfo, pTab) {
	let currentWindowId = (await browser.windows.getCurrent()).id;

	let selected = await browser.tabs.sendMessage(panoramaTabs[currentWindowId], {
		message: CONTENT_MSG_GET_SELECTION
	});

	switch (pInfo.menuItemId) {
	case 'reload':
		selected.forEach(id => {
			browser.tabs.reload(id);
		})
		break;

	case 'unload':
		browser.tabs.discard(selected);
		break;

	case 'close':
		browser.tabs.remove(selected);
		sendMessageToView(pTab.windowId, CONTENT_MSG_CLEAR_SELECTION);
		break;
	}
}

async function createPanoramaContextMenu() {
	const table = {
		reload: 'Reload Selection'
		, unload: 'Unload Selection'
		, close: 'Close Selection'
	};

	for (let k in table) {
		let entry = {
			id: k
			, title: table[k]
			, parentId: "panoramaRoot"
		}

		await browser.menus.create(entry);
	}
}

async function initContextMenu() {
	await browser.storage.local.get().then(function (v) {
		use_tst_context = v.use_tst_context || false;
	});

	let tabContextRoot = {
		id: "root"
		, title: "Move tab to group"
		, contexts: ["tab"]
	};

	let panoramaContextRoot = {
		id: "panoramaRoot"
		, title: "Selection"
		, contexts: ["page"]
		, documentUrlPatterns: [browser.runtime.getURL('view.html')]
	}

	await registerTST();
	await createTSTContextMenuItem(tabContextRoot);
	await browser.menus.create(tabContextRoot);
	await browser.menus.create(panoramaContextRoot);
	createPanoramaContextMenu();
	updateContextMenu();

	browser.menus.onShown.addListener(async (pInfo, pTab) => {
		if (pInfo.contexts.includes('tab')) {
			await updateContextMenu();
			browser.menus.refresh();
		}
	});

	browser.menus.onClicked.addListener(async (pInfo, pTab) => {
		switch (pInfo.parentMenuItemId) {
		case "root":
			tabContextMenuAction(pInfo, pTab);
			break;

		case "panoramaRoot":
			panoramaContextMenuAction(pInfo, pTab);
			break;
		}
	});

	if (!use_tst_context) {
		return;
	}

	// https://github.com/piroor/treestyletab/wiki/API-for-other-addons#handle-click-event-on-menu-item
	browser.runtime.onMessageExternal.addListener((aMessage, aSender) => {
		switch (aSender.id) {
		case kTST_ID:
			switch (aMessage.type) {
			case 'fake-contextMenu-click':
				tabContextMenuAction(aMessage.info, aMessage.tab);
				break;
			}
			break;
		}
	});
}

async function cycleGroup(dir) {
	await groups.init();
	let activeId = await groups.getActive();

	let nextGroup = groups.getNext(activeId, dir);

	while (nextGroup.stash == true) {
		if (nextGroup.id == activeId) {
			break;
		}
		nextGroup = groups.getNext(nextGroup.id, dir);
	}

	switchToGroup(nextGroup.id);
}

async function switchToGroup(groupId) {
	browser.tabs.query({
		currentWindow: true
	}).then(async function (result) {
		let arr = await Promise.all(result.map(async tab =>
			[tab.id, await tabs.getGroupId(tab.id)]
		));

		let comp = [];

		for (let i = 0; i < arr.length; i++) {
			comp[arr[i][0]] = arr[i][1];
		}

		let tab = result.filter(function (tab) {
			return comp[tab.id] == groupId;
		}).sort(function (a, b) {
			return a.lastAccessed - b.lastAccessed;
		}).pop();

		if (tab == null || tab == []) {
			// Tab OnCreated listener conflicts with this if this was to be done in a way that doesn't rely on function execution time
			groups.setActive(groupId);
			browser.tabs.create({
				active: true
			});
		}
		else {
			browser.tabs.update(tab.id, {
				active: true
			}).then(_ => {
				groups.setActive(groupId);
			})
		}
	});
}

async function unloadGroup(groupId) {
	tabs.forEach(async function (tab) {
		if (tab.pinned) {
			return;
		}

		if (await tabs.getGroupId(tab.id) == groupId) {
			browser.tabs.discard(tab.id);
		}
	});
}

async function reloadGroup(groupId) {
	await tabs.forEach(async function (tab) {
		if (tab.pinned) {
			return;
		}

		if (await tabs.getGroupId(tab.id) == groupId) {
			browser.tabs.reload(tab.id);
		}
	});
}

async function deleteGroup(groupId) {
	let collectPinnedTabsTo = await groups.getByIndex(0);
	groups.remove(groupId);

	tabs.forEach(async function (tab) {
		let tabId = await tabs.getGroupId(tab.id);
		if (tabId === undefined) {
			console.log(`Tab ${tab.id} had no group id`);
			return;
		}

		if (tab.pinned) {
			tabs.setGroupId(tab.id, collectPinnedTabsTo.id);
			return;
		}

		if (tabId == groupId) {
			browser.tabs.remove(tab.id);
		}
	});


	switchToActiveOrCurrent(groupId);
}

async function switchToActiveOrCurrent(groupId) {
	let activeId = await groups.getActive();

	if (activeId == groupId) {
		let first = true;

		groups.forEach(function (group) {
			if (first && group.stash == false) {
				first = false;
				groups.setActive(group.id);
				// switchToGroup(group.id);
			}
		});
	}
}

async function sendMessageToView(win, msg, options) {
	try {
		browser.tabs.sendMessage(panoramaTabs[win], {
			message: msg
			, options: options
		});
	}
	catch (e) {}
}

async function handleMessage(request, sender, sendResponse) {
	switch (request.message) {
	case MSG_SWITCH_TO_GROUP:
		switchToGroup(request.options);
		break;

	case MSG_SET_STASHED:
		groups.setStashed(request.options.id, request.options.state);
		if (request.options.state) {
			unloadGroup(request.options.id);
		}
		try {
			sendMessageToView(await (groups.get(request.options.id)).windowId, CONTENT_MSG_STASH_GROUP, {
				id: request.options.id
				, state: request.options.state
			});
		}
		catch (e) {}
		switchToActiveOrCurrent(request.options.id);
		break;

	case MSG_UNLOAD_GROUP:
		unloadGroup(request.options);
		break;

	case MSG_RELOAD_GROUP:
		reloadGroup(request.options);
		break;

	case MSG_OPEN_VIEW:
		openView();
		break;

	case MSG_DELETE_GROUP:
		deleteGroup(request.options);
		break;

	case MSG_NEWTAB:
		browser.tabs.create({
			// active: true
		})
		break;

	case MSG_REINIT:
		reinit();
		break;

	case MSG_NEW_GROUP:
		let group = await groups.create();
		try {
			sendMessageToView(group.windowId, CONTENT_MSG_NEW_GROUP, {
				group: group
			});
		}
		catch (e) {}
		break;

	case MSG_SET_ACTIVE:
		groups.setActive(request.options);
		break;

	case MSG_RENAME_GROUP:
		await groups.rename(request.options.id, request.options.name);
		break;

	case MSG_BEACON:
		handleBeacon(request.options);
		break;

	case MSG_UPDATE_CATCH_RULES:
		await updateCatchRules();
		break;
	}

}

async function handleBeacon(pTabId) {
	let tab = await browser.tabs.get(pTabId);

	if (panoramaTabs[tab.windowId] != null) {
		browser.tabs.get(panoramaTabs[tab.windowId]).then(resolve => {
			if (resolve.url == panoramaViewUrl && tab.id != resolve.id) {
				browser.tabs.remove(resolve.id);
			}
		});
	}

	panoramaTabs[tab.windowId] = tab.id;
}

async function tabActivated(info) {
	let id = info.tabId;

	if (id == panoramaTabs[info.windowId]) return;

	let groupId;
	let tab;

	try {
		await Promise.all([
			browser.tabs.get(id).then(function (pTab) {
				tab = pTab;
			}),

			tabs.getGroupId(id).then(function (pGroupId) {
				groupId = pGroupId;
			})
		]);
	}
	catch (e) {
		console.log(e);
		return;
	}

	if (groupId == undefined || groupId == -1 || tab.pinned) return;

	let activeGroup = await groups.getActive();

	if (groupId != activeGroup) {
		let group;

		group = await groups.get(groupId);

		if (group === undefined) {
			console.log(`Attempted to switch to non-existent group. Cause: ${info.tabId}`);
			console.log(`Attempted to fetch group ${groupId}`);
			return;
		}

		if (group.stash == true) {
			sendMessageToView(info.windowId, CONTENT_MSG_STASH_GROUP, {
				id: groupId
				, state: false
			});
		}

		groups.setActive(groupId);
	}
}

async function removePanoramaViewTabs() {
	browser.tabs.query({
		url: browser.extension.getURL('view.html')
	}).then(r => {
		r.forEach(tab => {
			let b = false;
			for (let key in panoramaTabs) {
				if (panoramaTabs[key] == tab.id) {
					b = true;
					break;
				}
			}
			if (!b) {
				browser.tabs.remove(tab.id);
			}
		})
	})
}

async function reinit() {
	panoramaTabs = [];
	await removePanoramaViewTabs();
	await salvageGrouplessTabs();
	await updateCatchRules();
}

async function init() {
	await migrateSettings();
	panoramaViewUrl = browser.runtime.getURL('view.html');
	let currentTab = await browser.tabs.query({
		active: true
		, currentWindow: true
	});

	await setupWindows();
	await groups.init();
	await removePanoramaViewTabs();
	await salvageGrouplessTabs();

	initContextMenu();

	browser.windows.onCreated.addListener(createGroupInWindow);
	browser.tabs.onCreated.addListener(tabCreated);
	browser.tabs.onActivated.addListener(tabActivated);
	browser.runtime.onMessage.addListener(handleMessage);

	browser.commands.onCommand.addListener(async function (command) {
		switch (command) {
		case "open-panorama":
			openView();
			break;
		case "open-popup":
			browser.browserAction.openPopup();
			break;
		case "cycle-next-group":
			cycleGroup(true);
			break;
		case "cycle-previous-group":
			cycleGroup(false);
			break;
		}
	});

	// browser.webNavigation.onCompleted.addListener(tabCatch);

	await updateCatchRules();

	browser.webNavigation.onCompleted.addListener(async (nav) => {
		let tab;
		try {
			tab = await browser.tabs.get(nav.tabId);
		}
		catch (e) {
			console.log(e);
			return;
		}

		tabCatch(tab, (tabId, groupId) => {
			tabs.setGroupIdUpdate(tabId, groupId);
			sendMessageToView(tab.windowId, CONTENT_MSG_TAB_MOVED, {
				id: tab.id
			});
		});
	});


	let windowId = (await browser.windows.getCurrent()).id;
	await groups.setActive(await browser.sessions.getWindowValue(windowId, 'activeGroup'));

	// printSessionData();
}

async function printSessionData() {
	let windowId = (await browser.windows.getCurrent()).id;

	console.log(await browser.sessions.getWindowValue(windowId, 'activeGroup'));
	console.log(await browser.sessions.getWindowValue(windowId, 'groups'));
}

init();