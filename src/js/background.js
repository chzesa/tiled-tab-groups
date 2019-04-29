'use strict';

var TABINTERFACE;
var QUEUE;
var BROWSERQUEUE;

var selectionSourceWindowId;

function setSelectionSourceWindow(windowId) {
	selectionSourceWindowId = windowId;
}
function getSelectionSourceWindow() {
	return selectionSourceWindowId;
}

function getSelectionFromSourceWindow() {
	let view = panoramaTabs[selectionSourceWindowId];
	if (view != null) {
		try {
			return view.getSelection();
		} catch(e) {
			console.log(e);
		}
	}

	return [];
}

async function removePanoramaViewTabs() {
	let tabs = await browser.tabs.query({
		url: browser.extension.getURL('view.html')
	});

	let n = tabs.length;

	let promises = [];

	for (var i = 0; i < n; i++) {
		let tab = tabs[i];

		let b = false;
		for (let key in panoramaTabs) {
			if (panoramaTabs[key] == tab.id) {
				b = true;
				break;
			}
		}
		if (!b) {
			promises.push(browser.tabs.remove(tab.id));
		}
	}

	await Promise.all(promises);
}

async function groupOrphans() {
	let windows = {};
	let salvageGroups = {};

	await TABINTERFACE.forEachWindow(async function (windowId) {
		windows[windowId] = TABINTERFACE.getGroupInterface(windowId);
		salvageGroups[windowId] = {};
	});

	await TABINTERFACE.forEach(async function (tab) {
		let groupId = tab.groupId;
		let windowId = tab.windowId;

		if (groupId == null || groupId < 0) {
			console.log(`Found tab with groupId ${groupId}`);
			await TABINTERFACE.setGroupId(tab.id
				, TABINTERFACE.getActiveGroupId(windowId));
		}
		else {
			if (windows[windowId].get(groupId) != null) {
				return;
			}

			if (Number.isInteger(groupId) == false) {
				console.log(`tab ${tab.id} (${tab.url}) had a non-integer group id: ${groupId}`);
				console.log(groupId);
			}

			console.log(`Found tab with groupId ${groupId}`);

			if (salvageGroups[windowId][groupId] == null) {
				salvageGroups[windowId][groupId] = windows[windowId].new();
			}

			await TABINTERFACE.setGroupId(tab.id
				, (await salvageGroups[windowId][groupId]).id
			);
		}
	});

	for (var win in salvageGroups) {
		for (var id in salvageGroups[win]) {
			let group = await salvageGroups[win][id];
			windows[win].rename(group.id, `${group.name} (Salvaged)`);
		}
	}
}

async function mostRecentInGroup(windowId, groupId = null) {
	let ret = [];

	await TABINTERFACE.forEach(function (tab) {
		ret.push(tab);
	}, windowId, groupId);

	ret = ret.sort(function (a, b) {
		return b.lastAccessed - a.lastAccessed;
	});

	return ret;
}

async function cycleGroup(offset) {
	let windowId = (await browser.windows.getCurrent()).id;
	let grpIfc = await TABINTERFACE.getGroupInterface(windowId);
	let activeId = await TABINTERFACE.getActiveGroupId(windowId);
	let group = grpIfc.get(activeId);
	let originalGroupId = group.id;

	do {
		group = grpIfc.getByIndex(group.index + offset);
		if (group.id == originalGroupId) {
			break;
		}
	} while (group.stash);

	await switchToGroup(windowId, group.id);
}

async function switchToGroup(windowId, groupId) {
	let array = await mostRecentInGroup(windowId, groupId);
	let ok = false;
	let n = array.length;

	if (n == 0) {
		await TABINTERFACE.setActiveGroup(windowId, groupId);
		browser.tabs.create({
			active: true
		});
		return;
	}

	var i = 0;
	while (ok == false && i < n) {
		try {
			var tabId = array[i++].id;
			if (panoramaTabs[windowId] != null &&
				tabId == panoramaTabs[windowId].tabId) {
				continue;
			}

			await browser.tabs.update(tabId, {
				active: true
			});

			ok = true;
		}
		catch (e) {

		}
	}
}

async function tryBrowserArrayOperation(array, op, ...param) {
	try {
		await op(array);
	}
	catch (e) {
		console.log(e);
		console.log(`Error in bulk operation, resubmitting individually.`);

		let n = array.length;
		for (var i = 0; i < n; i++) {
			try {
				await op(array[i], ...param);
			}
			catch (e) {

			}
		}
	}
}

async function unloadGroup(windowId, groupId) {
	QUEUE.do(null, async function () {
		let array = [];

		await TABINTERFACE.forEach(function (tab) {
			if (tab.pinned) return;
			array.push(tab.id);

		}, windowId, groupId);

		tryBrowserArrayOperation(array, browser.tabs.discard);
	});
}

async function alternativeGroup(windowId, groupId) {
	let grpIfc = TABINTERFACE.getGroupInterface(windowId);
	let group;
	let i = 0;

	let candidate;
	let stashCandidate;

	do {
		group = grpIfc.getByIndex(i);
		i++;

		if (group.id == groupId) {
			continue;
		}

		if (!group.stash) {
			candidate = group;
			break;
		}
		else {
			stashCandidate = group;
		}
	} while (group != null);

	if (candidate == null && stashCandidate == null) {
		return null;
	}

	if (candidate != null) {
		await TABINTERFACE.setActiveGroup(windowId, candidate.id);
		return candidate;
	}
	else {
		await setStash(windowId, collectId, false, true);
		await TABINTERFACE.setActiveGroup(windowId, stashCandidate.id);
		return stashCandidate;
	}
}

function deleteGroup(windowId, groupId) {
	QUEUE.do(null, async function () {
		let grpIfc = TABINTERFACE.getGroupInterface(windowId);
		if (grpIfc.get(groupId) == null) {
			return;
		}

		let collectId = TABINTERFACE.getActiveGroupId(windowId);

		// If the group is the current active group, find an alternative
		// group to activate.
		if (groupId == collectId) {
			let group = await alternativeGroup(windowId, groupId);
			if (group == null) {
				console.log(`Cannot remove the last group in a window.`);
				return;
			}

			collectId = group.id;
		}

		let close = [];
		let regroup = [];

		await TABINTERFACE.forEach(function (tab) {
			if (tab.pinned) {
				regroup.push(tab.id);
			}
			else {
				close.push(tab.id);
			}
		}, windowId, groupId);

		let n = regroup.length;
		for (var i = 0; i < n; i++) {
			await TABINTERFACE.setGroupId(regroup[i].id, collectId);
		}

		await TABINTERFACE.setActiveGroup(windowId, collectId);
		await tryBrowserArrayOperation(close, browser.tabs.remove);
		await grpIfc.remove(groupId);

		let view = panoramaTabs[windowId];
		if (view != null) {
			await view.onGroupRemoved(groupId);
		}
	});
}

async function setStash(windowId, groupId, state, now = false) {
	async function set() {
		let grpIfc = TABINTERFACE.getGroupInterface(windowId);
		if (grpIfc.get(groupId).stash == state) {
			return;
		}

		// If current group is being stashed, find alternative.
		// If current group is the only group in window do nothing.
		if (state && TABINTERFACE.getActiveGroupId(windowId) == groupId) {
			let group = await alternativeGroup(windowId, groupId);
			if (group == null) {
				console.log(`Cannot stash the last group in a window.`);
				return;
			}
		}

		// If the group is being stashed, unload all tabs in the group.
		if (state) {
			let array = [];

			await TABINTERFACE.forEach(function (tab) {
				if (tab.pinned) return;
				array.push(tab.id);

			}, windowId, groupId);

			await tryBrowserArrayOperation(array, browser.tabs.discard);
		}

		await grpIfc.setStash(groupId, state);

		let view = panoramaTabs[windowId];
		if (view != null) {
			await view.onStashed(groupId);
		}
	}

	if (now) {
		await set();
	}
	else {
		QUEUE.do(null, set);
	}
}

function enqueueTask(task, param = null) {
	return QUEUE.do(param, task);
}

function getView(windowId) {
	return panoramaTabs[windowId];
}

async function reinit() {
	panoramaTabs = [];
	await removePanoramaViewTabs();
	await groupOrphans();
	await TABINTERFACE.forEachWindow(updateCatchRules);
}

function init() {
	QUEUE = newSyncQueue(false);

	QUEUE.do(null, async function () {
		BROWSERQUEUE = newSyncQueue();
		await migrateSettings();
		panoramaViewUrl = browser.runtime.getURL('view.html');

		TABINTERFACE = await tabInterface(QUEUE, BROWSERQUEUE);
		await reinit();
		await initContextMenu();
	});

	browser.tabs.onCreated.addListener(function (tab) {
		QUEUE.do(null, async function () {
			tab = await TABINTERFACE.onCreated(tab);

			let view = panoramaTabs[tab.windowId];
			if (view != null) {
				await view.onCreated(tab, tab.groupId);
			}
		});
	});

	browser.tabs.onRemoved.addListener(function (tabId, info) {
		QUEUE.do(null, async function () {
			let groupId = TABINTERFACE.getGroupId(tabId);
			TABINTERFACE.onRemoved(tabId, info);
			let windowId = info.windowId;

			let view = panoramaTabs[windowId];
			if (view == null) return;

			if (view.tabId == tabId) {
				delete panoramaTabs[windowId];
			}
			else {
				view.onRemoved(tabId, groupId);
			}
		});
	});

	browser.tabs.onActivated.addListener(function (info) {
		QUEUE.do(null, async function () {
			let tabId = info.tabId;
			let windowId = info.windowId;

			TABINTERFACE.onActivated(tabId);

			let view = panoramaTabs[windowId];
			if (view != null) {
				if (view.tabId == tabId) {
					await view.onActivated(tabId);
					return;
				}
				else {
					browser.tabs.hide(view.tabId);
				}
			}

			let groupId = TABINTERFACE.getGroupId(tabId);
			if (groupId == -1) return;

			let group = TABINTERFACE.getGroup(windowId, groupId);
			if (group == null) return;

			if (group.stash == true) {
				await setStash(windowId, groupId, false, true);
			}

			await TABINTERFACE.setActiveGroup(windowId, groupId);
		});
	});

	browser.tabs.onMoved.addListener(function (tabId, info) {
		QUEUE.do(null, async function () {
			TABINTERFACE.onMoved(tabId, info);

			let view = panoramaTabs[info.windowId];
			if (view != null) {
				await view.onMoved(tabId);
			}
		});
	});

	browser.tabs.onUpdated.addListener(function (tabId, info, tab) {
		QUEUE.do(null, async function () {
			let windowId = tab.windowId;

			tab = TABINTERFACE.onUpdated(tab);
			if (tab == null) return;

			let view = panoramaTabs[tab.windowId];

			if (view != null) {
				try {
					if (`pinned` in info) {
						await view.onUpdated(tab, info);
					}
					else {
						view.onUpdated(tab, info);
					}
				}
				catch (e) {
					console.log(e);
				}
			}
		});
	});

	browser.tabs.onAttached.addListener(function (tabId, info) {
		QUEUE.do(null, async function () {
			let tab = TABINTERFACE.get(tabId);
			if (tab == null) return;

			let view = panoramaTabs[tab.windowId];
			if (view != null) {
				view.onRemoved(tabId, tab.groupId);
			}

			await TABINTERFACE.onAttached(tabId, info);

			tab = TABINTERFACE.get(tabId);
			view = panoramaTabs[tab.windowId];
			if (view != null) {
				await view.onCreated(tab, tab.groupId);
			}
		});
	});

	browser.commands.onCommand.addListener(async function (command) {
		QUEUE.do(null, async function () {
			switch (command) {
			case "open-panorama":
				await openView();
				break;
			case "open-popup":
				await browser.browserAction.openPopup();
				break;
			case "cycle-next-group":
				await cycleGroup(1);
				break;
			case "cycle-previous-group":
				await cycleGroup(-1);
				break;
			}
		});
	});

	QUEUE.enable();
}

async function VALIDATE_CACHE() {
	let tabs = await browser.tabs.query({});

	function find(id) {
		for (var i = 0; i < tabs.length; i++) {
			let tab = tabs[i];

			if (tab.id == id) {
				return true;
			}
		}
		return false;
	}

	for (var i = 0; i < tabs.length; i++) {
		let tab = tabs[i];
		let cachedTab = TABINTERFACE.get(tab.id);

		if (cachedTab == null) {
			console.log(`Tab ${tab.id} (${tab.url}) doesn't exist in cache`);
		}

		if (tab.index != cachedTab.index) {
			console.log(`Tab ${tab.id} (${tab.url}) cached index is wrong. Actual ${tab.index}, cached: ${cachedTab.index}`);
		}

		if (tab.id != cachedTab.id) {
			console.log(`Cached tab ${cachedTab.id} (${cachedTab.url}) was stored with key ${tab.id})`);
		}
	}

	await TABINTERFACE.forEach(async function (tab) {
		if (!find(tab.id)) {
			condole.log(`Cache contains tab ${tab.id} (${tab.url}) which wasn't found when querying the browser`);
		}
	});

	await TABINTERFACE.forEachWindow(async function (windowId) {
		await TABINTERFACE.forEach(async function (tab) {
			if (!find(tab.id)) {
				condole.log(`Cache contains tab ${tab.id} (${tab.url}) in window ${windowId} array, which wasn't found when querying the browser.`);
			}

			if (!(TABINTERFACE.get(tab.id) === tab)) {
				console.log(`Different tab object was stored in window array than in map`);
				console.log(TABINTERFACE.get(tab.id));
				console.log(tab);
			}
		}, windowId);
	});

	console.log(`Done.`);
}

init();