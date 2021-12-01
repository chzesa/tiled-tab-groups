const DYNAMIC_MAP = {};

function dynamicSubmenu(menuPrefix, parentId, iteratorFn, filterFn, titleFn, iconFn, mapFn, onclick) {
	let array = [];
	let state = [];
	let ret = { array, state }

	ret.update = param => {
		let count = 0;
		let changed = false;

		iteratorFn(param)(v => {
			if (!filterFn(v, param)) { return; }
			let title = titleFn(v, param);
			let icons = iconFn(v, param);

			let menuIndex = count++;
			let info = array[menuIndex];

			if (info == null) {
				info = {
					id: `${menuPrefix}${menuIndex}`
					, title
					, onclick
					, parentId
				};

				if (icons["16"] != null) { info.icons = icons; }

				array.push(info);
				browser.menus.create(info);
				state[menuIndex] = { visible: true, title, icons };
				changed = true;
			} else {
				if (!state[menuIndex].visible
					|| state[menuIndex].title != title
					|| state[menuIndex].icons["16"] != icons["16"]
					|| state[menuIndex].icons["32"] != icons["32"]) {
					changed = true;

					state[menuIndex].visible = true;
					state[menuIndex].title = title;
					state[menuIndex].icons = icons;

					let updateInfo = {
						title,
						visible: true
					};

					if (icons["16"] != null) { updateInfo.icons = icons; }

					browser.menus.update(info.id, updateInfo);
				}
			}

			DYNAMIC_MAP[info.id] = mapFn(v, param);
		});

		for (let i = count; i < array.length; i++) {
			if (state[i].visible) {
				changed = true;
				state[i].visible = false;
				browser.menus.update(array[i].id, {
					visible: false
				});
			}
		}

		return changed;
	}

	return ret;
}

function menuActionMoveToWindow(info, tab) {
	let windowId = DYNAMIC_MAP[info.menuItemId];
	let ids = menuGetSelection(tab).then(ids => {
		browser.tabs.move(ids, {
			windowId,
			index: -1
		});
	});
}

async function menuActionMoveToGroup(info, tab) {
	let ids = await menuGetSelection(tab);
	let groupId = DYNAMIC_MAP[info.menuItemId];

	QUEUE.do(async () => {
		let windowId = tab.windowId;
		setGroupId(ids, groupId, tab.windowId);
		if (ids.includes(CACHE.getActive(windowId).id)) {
			await setStash(windowId, groupId,  false);
			setActiveGroup(windowId, groupId);
		}
		view(tab.windowId, "reorderGroup", groupId);
	})
}

async function openLinkInGroup(info, opener) {
	let groupId = DYNAMIC_MAP[info.menuItemId];

	browser.tabs.create({
		active: false,
		cookieStoreId: opener.cookieStoreId,
		openerTabId: opener.id,
		url: info.linkUrl
	}).then(tab => {
		QUEUE.do(tabId => {
			let tab = CACHE.get(tabId);
			setGroupId(tab.id, groupId);
			view(tab.windowId, `onGroupCreated`, groupId);
			view(tab.windowId, `reorderGroup`, groupId);
		}, tab.id);
	});
}

async function menuGetSelection(tab) {
	let ids;
	try {
		if (VIEW_CONTEXT_SHOWN) {
			ids = panoramaTabs[tab.windowId].view.getSelection();
		} else if (tab.highlighted) {
			ids = (await browser.tabs.query({highlighted: true, currentWindow: true}))
				.map(tab => tab.id);
		}
	} catch(e) {
		console.log(e);
	}

	if (ids == null || ids.length == 0) {
		ids = [tab.id];
	}

	return ids;
}

let LAST_CONTEXT = false;

async function initContextMenu() {
	const menus = [
		'reload', 'mute', 'pin', 'duplicate', 'bookmark', 'move', 'unload', 'close',
		's1', 's2', 'moveSelection'
	];

	await createFakeTabMenu();
	menus.forEach(id => browser.menus.update(id, { visible: false }));

	let moveToWindowSubmenu = await dynamicSubmenu(`moveToWindow`, `move`,
		_ => CACHE.forEachWindow,
		(windowId, tab) => windowId != tab.windowId,
		(windowId, tab) => {
			let numTabs = CACHE.debug().windows[windowId].length;
			let activeInWindow = CACHE.getActive(windowId);
			return `Window ${windowId} (${numTabs > 1
				? `${numTabs} tabs`
				: ``} active: ${activeInWindow.title})`;
		},
		_ => { return {}; },
		(windowId, tab) => windowId,
		menuActionMoveToWindow
	);

	let moveToGroupSubmenu = await dynamicSubmenu(`moveToGroup`, `moveGroup`,
		tab => WINDOWGROUPS[tab.windowId].forEach,
		_ => true,
		group => group.name,
		_ => { return {}; },
		(group, _) => group.id,
		menuActionMoveToGroup
	);

	let openInGroupSubmenu = await dynamicSubmenu(`openInGroup`, `openGroup`,
		tab => WINDOWGROUPS[tab.windowId].forEach,
		(group, tab) => group.id != CACHE.getValue(tab.id, `groupId`),
		group => group.name,
		_ => { return {}; },
		(group, _) => group.id,
		openLinkInGroup
	);

	browser.menus.onShown.addListener(function (info, tab) {
		let changed = false;
		if (info.contexts.includes('tab')) {
			if (VIEW_CONTEXT_SHOWN != LAST_CONTEXT) {
				menus.forEach(id => browser.menus.update(id, { visible: VIEW_CONTEXT_SHOWN }));
				changed = true;
				LAST_CONTEXT = VIEW_CONTEXT_SHOWN;
			}

			if (VIEW_CONTEXT_SHOWN && panoramaTabs[tab.windowId]) {
				browser.menus.update('moveSelection',{
					visible: panoramaTabs[tab.windowId].view.querySelection().length > 0
				})
				changed = true
			}

			changed = moveToWindowSubmenu.update(tab) || changed;
			changed = moveToGroupSubmenu.update(tab) || changed;
		}

		if (info.contexts.includes('link')) {
			changed = openInGroupSubmenu.update(tab) || changed;
		}

		if ( changed ) browser.menus.refresh();
	});

	browser.menus.onHidden.addListener(_ => VIEW_CONTEXT_SHOWN = false);
}

function menuCreateInfo(id, title, callback, parentId) {
	let info =  {
		id
		, title
		, contexts: ['tab']
		, onclick: callback
		, parentId
	};

	return info;
}

function createFakeTabMenu() {
	browser.menus.create(menuCreateInfo('reload', '&Reload Tab', async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => browser.tabs.reload(id));
	}));

	browser.menus.create(menuCreateInfo('mute', '&Mute Tab', async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => {
			browser.tabs.get(id).then(tab => {
				browser.tabs.update(id, {
					muted: tab.mutedInfo == null ? true : !tab.mutedInfo.muted
				});
			});
		});
	}));

	browser.menus.create(menuCreateInfo('pin', '&Pin Tab', async (info, tab) => {
		let ids = await menuGetSelection(tab);

		QUEUE.do(async () => {
			let pinned = !CACHE.get(ids[0]).pinned;

			ids.forEach(id => {
				browser.tabs.update(id, {
					pinned
				});
			});
		});
	}));

	browser.menus.create(menuCreateInfo('duplicate', '&Duplicate Tab', async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => browser.tabs.duplicate(id));
	}));

	let separator = menuCreateInfo('s1');
	separator.type = 'separator';

	browser.menus.create(separator);

	browser.menus.create(menuCreateInfo('bookmark', '&Bookmark Tab', async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => {
			browser.tabs.get(id).then(tab => {
				browser.bookmarks.create({
					title: tab.title
					, url: tab.url
				});
			});
		});
	}));

	browser.menus.create(menuCreateInfo('move', 'Mo&ve Tab', null));

	browser.menus.create(menuCreateInfo('moveToStart', 'Move to &Start', async (info, tab) => {
		let index = 0;
		let windowId = tab.windowId;

		if (!tab.pinned) {
			while(true) {
				if (CACHE.getIndexed(windowId, index).pinned == false ) {
					break;
				}

				index++;
			}
		}

		let ids = await menuGetSelection(tab);

		browser.tabs.move(ids, {
			index,
			windowId
		});
	}, 'move'));

	browser.menus.create(menuCreateInfo('moveToEnd', 'Move to &End', async (info, tab) => {
		let windowId = tab.windowId;
		let ids = await menuGetSelection(tab);

		browser.tabs.move(ids, {
			index: -1,
			windowId,
		});
	}, 'move'));

	browser.menus.create(menuCreateInfo('moveToNewWindow', 'Move to New &Window', async (info, tab) => {
		let ids = await menuGetSelection(tab);
		let tabId = ids.shift();

		browser.windows.create({
			tabId
		}).then(window => {
			browser.tabs.move(ids, {
				index: -1,
				windowId: window.id,
			});
		});
	}, 'move'));


	let moveSeparator = menuCreateInfo(null, null, null, 'move');
	moveSeparator.type = 'separator';
	browser.menus.create(moveSeparator);

	browser.menus.create(menuCreateInfo('moveGroup', 'Move Tab to &Group', null));

	browser.menus.create(menuCreateInfo('moveToNewGroup', `Move Tab to New &Group`, async (info, tab) => {
		let ids = await menuGetSelection(tab);
		QUEUE.do(async tab => {
			let ifc = WINDOWGROUPS[tab.windowId];
			let group = await ifc.new();
			let groupId = group.id;

			let windowId = tab.windowId;

			setGroupId(ids, groupId, tab.windowId);

			if (tab.active || tab.highlighted) {
				setActiveGroup(windowId, groupId);
			}
			view(windowId, `onGroupCreated`, groupId);
			view(windowId, `reorderGroup`, groupId);
		}, tab);
	}, `moveGroup`));

	let moveGroupSeparator = menuCreateInfo(null, null, null, 'moveGroup');
	moveGroupSeparator.type = 'separator';
	browser.menus.create(moveGroupSeparator);

	separator.id = 's2';
	browser.menus.create(separator);

	browser.menus.create(menuCreateInfo('moveSelection', 'Place &Selection', null));

	browser.menus.create(menuCreateInfo('moveSelectionBefore', '&Before tab', async (info, tab) => {
		let ids = await menuGetSelection(tab);
		let windowId = tab.windowId
		let index = tab.index

		ids.forEach(id => index -= CACHE.get(id).index < tab.index ? 1 : 0)

		browser.tabs.move(ids, {
			index,
			windowId,
		});

		setGroupId(ids, CACHE.getValue(tab.id, 'groupId'), tab.windowId)
	}, 'moveSelection'));

	browser.menus.create(menuCreateInfo('moveSelectionAfter', '&After tab', async (info, tab) => {
		let ids = await menuGetSelection(tab);
		let windowId = tab.windowId
		let index = tab.index

		ids.forEach(id => index += CACHE.get(id).index >= tab.index ? 1 : 0)

		browser.tabs.move(ids, {
			index,
			windowId,
		});

		setGroupId(ids, CACHE.getValue(tab.id, 'groupId'), tab.windowId)
	}, 'moveSelection'));

	browser.menus.create(menuCreateInfo('unload', 'U&nload Tab', async (info, tab) => {
		browser.tabs.discard(await menuGetSelection(tab));
	}));

	browser.menus.create(menuCreateInfo('close', '&Close Tab', async (info, tab) => {
		let selection = (await menuGetSelection(tab)).reverse();
		let activeId = CACHE.getActive(tab.windowId).id;
		let activeTabIndex = selection.indexOf(activeId);

		if (activeTabIndex != -1) {
			selection.splice(activeTabIndex, 1);
			selection.push(activeId);
		}

		browser.tabs.remove(selection);
	}));

	browser.menus.create({id: 'openGroup', title: 'Open in Group', contexts: [`link`]});
	browser.menus.create({
		id: 'openInNewGroup',
		title: 'Open in New &Group',
		parentId: `openGroup`,
		onclick: (info, tab) => {QUEUE.do(async (info, opener) => {
			let windowId = opener.windowId;
			let ifc = WINDOWGROUPS[windowId];
			let group = await ifc.new();
			let groupId = group.id;

			browser.tabs.create({
				active: false,
				cookieStoreId: opener.cookieStoreId,
				openerTabId: opener.id,
				url: info.linkUrl
			}).then(tab => {
				QUEUE.do(tabId => {
					let tab = CACHE.get(tabId);
					setGroupId(tab.id, groupId);
					view(tab.windowId, `onGroupCreated`, groupId);
					view(tab.windowId, `reorderGroup`, groupId);
				}, tab.id);
			});
		}, info, tab);}
	});

	browser.menus.create({
		parentId: `openGroup`,
		type: `separator`
	});
}