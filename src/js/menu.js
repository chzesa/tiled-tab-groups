const menus = [];

function updateContextMenu(windowId) {
	let grpIfc = WINDOWGROUPS(windowId);
	let id = 0;

	grpIfc.forEach(function (group) {
		if (menus[id] == null) {
			menus[id] = {
				windowId
				, groupId: group.id
			};

			browser.menus.create({
				id: `${id}`
				, title: group.name
				, parentId: "root"
			});
		} else {
			menus[id] = {
				windowId
				, groupId: group.id
			}

			browser.menus.update(`${id}`, {
				visible: true
				, title: group.name
			});
		}

		id++;
	});

	for (var i = id; i < menus.length; i++) {
		browser.menus.update(`${i}`, {
			visible: false
		});
	}
}

function tabContextMenuAction(info, tab) {
	QUEUE.do(async function () {
		let groupId;

		if (info.menuItemId == "newGroup") {
			let ifc = WINDOWGROUPS(tab.windowId);
			let group = await ifc.new();
			groupId = group.id;
		} else {
			groupId = menus[info.menuItemId].groupId;
		}

		let windowId = tab.windowId;
		if (CACHE.getGroup(windowId, groupId).stash) {
			await setStash(windowId, groupId, false, true);
		}

		setGroupId(tab.id, groupId);

		if (tab.active) {
			setActiveGroup(windowId, groupId);
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

	await browser.menus.create({
		id: "newGroup"
		, title: "New group"
		, parentId: "root"
	});

	await browser.menus.create({
		type: "separator"
		, parentId: "root"
	});
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