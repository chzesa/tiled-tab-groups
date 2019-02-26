const contextMenuIds = [];

const menuGroupState = {
	active: 0
	, deleted: 1
};

async function createContextMenuItem(group) {
	let id = group.id;
	contextMenuIds[id] = menuGroupState.active;

	let params = {
		id: `${id}`
		, title: `${group.name}`
		, parentId: "root"
	};

	browser.menus.create(params);
}

function updateContextMenu(windowId) {
	for (let i in contextMenuIds) {
		contextMenuIds[i] = menuGroupState.deleted;
	}

	let grpIfc = TABINTERFACE.getGroupInterface(windowId);

	grpIfc.forEach(function (group) {
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
		}
	});

	for (let i in contextMenuIds) {
		if (contextMenuIds[i] == menuGroupState.deleted) {
			browser.menus.remove(i);
		}
	}
}

function tabContextMenuAction(info, tab) {
	QUEUE.do(null, async function () {
		let groupId = info.menuItemId;
		let windowId = tab.windowId;
		if (TABINTERFACE.getGroup(windowId, groupId).stash) {
			await setStash(windowId, groupId, false, true);
		}

		await TABINTERFACE.setGroupId(tab.id, groupId);

		if (tab.active) {
			await TABINTERFACE.update(windowId);
		}

		let view = panoramaTabs[tab.windowId];
		if (view != null) {
			await view.reorderGroup(groupId);
		}
	});
}

async function panoramaContextMenuAction(info, tab) {
	let windowId = (await browser.windows.getCurrent()).id;

	let selected = panoramaTabs[windowId].getSelection();

	switch (info.menuItemId) {
	case 'reload':
		selected.forEach(function (id) {
			browser.tabs.reload(id);
		})
		break;

	case 'unload':
		tryBrowserArrayOperation(selected, browser.tabs.discard);
		break;

	case 'close':
		tryBrowserArrayOperation(selected, browser.tabs.remove);
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

	await browser.menus.create(tabContextRoot);
	await browser.menus.create(panoramaContextRoot);
	createPanoramaContextMenu();

	browser.menus.onShown.addListener(async function (info, tab) {
		if (info.contexts.includes('tab')) {
			updateContextMenu(tab.windowId);
			browser.menus.refresh();
		}
	});

	browser.menus.onClicked.addListener(async function (info, tab) {
		switch (info.parentMenuItemId) {
		case "root":
			tabContextMenuAction(info, tab);
			break;

		case "panoramaRoot":
			panoramaContextMenuAction(info, tab);
			break;
		}
	});
}