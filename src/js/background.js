'use strict';

var QUEUE;
var CACHE;
var WINDOWGROUPS = {};
var ACTIVEGROUP = {};

let CONFIG = {};

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
			return view.view.getSelection();
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
			if (panoramaTabs[key].tabId == tab.id) {
				b = true;
				break;
			}
		}
		if (!b) {
			promises.push(removeViewTab(tab.id));
		}
	}

	await Promise.all(promises);
}

async function groupOrphans() {
	let windows = {};
	let salvageGroups = {};

	await CACHE.forEachWindow(async function (windowId) {
		windows[windowId] = await onWindowCreated(windowId);
		salvageGroups[windowId] = {};
	});

	await CACHE.forEach(async function (tab) {
		let groupId = CACHE.getValue(tab.id, 'groupId');
		let windowId = tab.windowId;

		if (groupId == null || groupId < 0) {
			console.log(`Found tab with groupId ${groupId}`);
			setGroupId(tab.id, ACTIVEGROUP[windowId]);
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

			setGroupId(tab.id, (await salvageGroups[windowId][groupId]).id);
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

	await CACHE.forEach(function (tab) {
		ret.push(tab);
	}, windowId, function(tab) {
		return groupId == CACHE.getValue(tab.id, 'groupId');
	});

	ret = ret.sort(function (a, b) {
		return b.lastAccessed - a.lastAccessed;
	});

	return ret;
}

async function cycleGroup(offset) {
	let windowId = (await browser.windows.getCurrent()).id;
	let grpIfc = WINDOWGROUPS[windowId];
	let activeId = ACTIVEGROUP[windowId];
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
		setActiveGroup(windowId, groupId);
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
	QUEUE.do(async function () {
		let array = [];

		await CACHE.forEach(function (tab) {
			if (tab.pinned) return;
			array.push(tab.id);

		}, windowId, function(tab) {
			return groupId == CACHE.getValue(tab.id, 'groupId');
		});

		tryBrowserArrayOperation(array, browser.tabs.discard);
	});
}

async function alternativeGroup(windowId, groupId) {
	let grpIfc = WINDOWGROUPS[windowId];
	let group;
	let i = 0;

	let candidate;
	let stashCandidate;

	do {
		group = grpIfc.getByIndex(i);
		if (group.index < i) return null;

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
		setActiveGroup(windowId, candidate.id);
		return candidate;
	}
	else {
		await setStash(windowId, collectId, false);
		setActiveGroup(windowId, stashCandidate.id);
		return stashCandidate;
	}
}

function deleteGroup(windowId, groupId) {
	QUEUE.do(async function () {
		let grpIfc = WINDOWGROUPS[windowId];
		if (grpIfc.get(groupId) == null) {
			return;
		}

		let collectId = ACTIVEGROUP[windowId];

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

		await CACHE.forEach(function (tab) {
			if (tab.pinned) {
				regroup.push(tab.id);
			}
			else {
				close.push(tab.id);
			}
		}, windowId, function(tab) {
			return groupId == CACHE.getValue(tab.id, 'groupId');
		});

		setGroupId(regroup, collectId);

		setActiveGroup(windowId, collectId);
		await tryBrowserArrayOperation(close, browser.tabs.remove);
		await grpIfc.remove(groupId);

		view(windowId, "onGroupRemoved", groupId);
	});
}

async function setStash(windowId, groupId, state) {
	let grpIfc = WINDOWGROUPS[windowId];

	if (grpIfc == null || grpIfc.get(groupId) == null
		|| grpIfc.get(groupId).stash == state) {
		return;
	}

	// If current group is being stashed, find alternative.
	// If current group is the only group in window do nothing.
	if (state && ACTIVEGROUP[windowId] == groupId) {
		let group = await alternativeGroup(windowId, groupId);
		if (group == null) {
			console.log(`Cannot stash the last group in a window.`);
			return;
		}
	}

	// If the group is being stashed, unload all tabs in the group.
	if (state) {
		let array = [];

		await CACHE.forEach(function (tab) {
			if (tab.pinned) return;
			array.push(tab.id);

		}, windowId, function(tab) {
			return groupId == CACHE.getValue(tab.id, 'groupId');
		});

		await tryBrowserArrayOperation(array, browser.tabs.discard);
	}

	await grpIfc.setStash(groupId, state);
	view(windowId, "onStashed", groupId);
}

function enqueueTask(task, ...param) {
	return QUEUE.do(task, ...param);
}

function getView(windowId) {
	return panoramaTabs[windowId];
}

function getGroup(windowId, groupId) {
	if (WINDOWGROUPS[windowId] == null) {
		return null;
	}

	return WINDOWGROUPS[windowId].get(groupId);
}

function setActiveGroup(windowId, groupId) {
	if (ACTIVEGROUP[windowId] == groupId) return;
	// await setStash(windowId, groupId, false);

	browser.sessions.setWindowValue(windowId, 'activeGroup', groupId);
	ACTIVEGROUP[windowId] = groupId;
	updateWindow(windowId);
}

function setGroupId(tabId, groupId, windowId = null) {
	if (Array.isArray(tabId) && tabId.length == 0) return;

	if (windowId == null) {
		let referenceTab = Array.isArray(tabId) ? CACHE.get(tabId[0]) : CACHE.get(tabId);
		if (referenceTab == null) {
			throw new Error(`null reference tab, tabId ${tabId}, groupId ${groupId}`);
		}

		windowId = referenceTab.windowId;
	}

	if (groupId == null || groupId >= 0 &&
		(WINDOWGROUPS[windowId] == null || WINDOWGROUPS[windowId].get(groupId) == null)) {
		return;
	}

	if (Array.isArray(tabId)) {
		tabId.forEach(function (id) {
			let currentGroupId = CACHE.getValue(id, 'groupId');
			if (currentGroupId == -1 || currentGroupId == groupId) return;
			CACHE.setValue(id, 'groupId', groupId);
		});
		updateWindow(windowId);
	}
	else {
		let currentGroupId = CACHE.getValue(tabId, 'groupId');
		if (currentGroupId == -1 || currentGroupId == groupId) return;
		CACHE.setValue(tabId, 'groupId', groupId);

		let tab = CACHE.get(tabId);
		if (tab == null) return;

		if (tab.active) updateWindow(windowId)
		else updateTab(tabId);
	}
}

function updateTab(tabId) {
	let tab = CACHE.get(tabId);
	let windowId = tab.windowId;

	if (CACHE.getValue(tab.id, 'groupId') == ACTIVEGROUP[windowId]) {
		browser.tabs.show(tabId);
	} else {
		browser.tabs.hide(tabId);
	}
}

function updateWindow(windowId) {
	let activeGroupId = ACTIVEGROUP[windowId];
	let hide = [];
	let show = [];

	CACHE.forEach(function(tab) {
		if (CACHE.getValue(tab.id, 'groupId') == activeGroupId) {
			show.push(tab.id);
		} else {
			hide.push(tab.id);
		}
	}, windowId);

	if (CONFIG.unloadGroupOnSwitch) {
		let discard = hide.filter(id => !CACHE.get(id).pinned);
		tryBrowserArrayOperation(discard, browser.tabs.discard);
	}
	tryBrowserArrayOperation(hide, browser.tabs.hide);
	tryBrowserArrayOperation(show, browser.tabs.show);
}

async function onWindowCreated(windowId) {
	if (WINDOWGROUPS[windowId] != null)  {
		return WINDOWGROUPS[windowId];
	}

	let groups = await groupInterface(windowId);
	WINDOWGROUPS[windowId] = groups;

	ACTIVEGROUP[windowId] = await browser.sessions.getWindowValue(windowId, 'activeGroup');
	if (ACTIVEGROUP[windowId] == null) {
		ACTIVEGROUP[windowId] = groups.getByIndex(0).id;
	}

	return groups;
}

async function onCommand(command) {
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
}

async function onActivated(tab, info) {
	let windowId = tab.windowId;
	let tabId = tab.id;

	let pView = panoramaTabs[windowId];
	if (pView != null) {
		if (pView.tabId == tabId) {
			view(windowId, "onActivated", tabId);
			return;
		}
		else {
			browser.tabs.hide(pView.tabId);
		}
	}

	if (tab.pinned == true) return;

	let groupId = CACHE.getValue(tabId, 'groupId');
	if (groupId == -1) return;

	await setStash(windowId, groupId, false);
	setActiveGroup(windowId, groupId);
}

async function onAttached(tab, info) {
	let groupId = CACHE.getValue(tab.id, 'groupId');

	view(info.oldWindowId, "onRemoved", tab.id, groupId);

	let groups = await onWindowCreated(tab.windowId);
	if (groups.get(groupId) == null) {
		let activeGroup = groups.get(ACTIVEGROUP[tab.windowId]);
		groupId = activeGroup.id;
		CACHE.setValue(tab.id, 'groupId', groupId);
		updateTab(tab.id);
	}

	view(tab.windowId, "onCreated", tab, groupId);
}

async function onCreated(tab) {
	let windowId = tab.windowId;
	let groupId = CACHE.getValue(tab.id, 'groupId');
	if (groupId == null || groupId == -1) {
		if (ACTIVEGROUP[windowId] == null) {
			await onWindowCreated(windowId);
		}

		groupId = ACTIVEGROUP[windowId];
		CACHE.setValue(tab.id, 'groupId', groupId);
	}

	if (tab.active) {
		updateWindow(windowId);
	} else {
		updateTab(tab.id);
	}

	view(tab.windowId, "onCreated", tab, groupId);
}

async function onMoved(tab, info) {
	view(tab.windowId, "onMoved", tab.id);
}

async function onRemoved(tab, info, values) {
	let groupId = values.groupId;
	let windowId = tab.windowId;

	view(windowId, "onRemoved", tab.id, groupId);
}

async function onUpdated(tab, info) {
	if (CONFIG.unstashOnTabLoad && 'status' in info && tab.status == 'loading') {
		let groupId = CACHE.getValue(tab.id, 'groupId');
		if (groupId == -1) return;

		await setStash(tab.windowId, groupId, false);
	}

	if ('pinned' in info && tab.pinned == false) {
		if (tab.active){
			let groupId = CACHE.getValue(tab.id, 'groupId');
			setActiveGroup(tab.windowId, groupId);
		} else {
			updateTab(tab.id);
		}
	}

	view(tab.windowId, "onUpdated", tab, info);
}

function view(windowId, fn, ...param) {
	let view = panoramaTabs[windowId];
	if (view == null) return;

	try {
		view.view[fn](...param);
	} catch(e) {
		browser.tabs.remove(view.tabId);
		delete panoramaTabs[windowId];
	}
}

async function updateConfig() {
	CONFIG = await browser.storage.local.get();
}

let VIEW_CONTEXT_SHOWN;

function viewContextShown() {
	VIEW_CONTEXT_SHOWN = true;
}

async function init(cache) {
	panoramaViewUrl = browser.runtime.getURL('view.html');
	panoramaTabs = [];
	await migrateSettings();
	await updateConfig();
	await removePanoramaViewTabs();
	await groupOrphans();
	await cache.forEachWindow(updateCatchRules);
	await initContextMenu();

	cache.update = updateWindow;
	cache.setGroupId = setGroupId;
	cache.getGroupId = function(tabId) {
		return CACHE.getValue(tabId, 'groupId');
	}
	cache.setActiveGroup = setActiveGroup;
	cache.getActiveGroupId = function(windowId) {
		return ACTIVEGROUP[windowId];
	}
	cache.getGroupInterface = function(windowId) {
		return WINDOWGROUPS[windowId];
	}
	cache.getGroup = function(windowId, groupId) {
		return WINDOWGROUPS[windowId] == null ? null : WINDOWGROUPS[windowId].get(groupId);
	}
}

function start() {
	CACHE = newCache({
		listeners: {
			onActivated,
			onAttached,
			onCreated,
			onMoved,
			onRemoved,
			onUpdated
		},
		auto: true,
		tabValueKeys: ['groupId']
	});

	QUEUE = CACHE.debug().queue;

	browser.commands.onCommand.addListener(async function (command) {
		QUEUE.do(onCommand, command);
	});

	CACHE.init(init);
}

start();