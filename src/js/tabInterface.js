async function tabInterface(queue, browserQueue) {
	const self = {};
	const windows = {};
	const tabs = {};
	const activeGroup = {};
	const groups = {};
	var updateWindows = {};

	async function updateTab(tabId) {
		let tab = tabs[tabId];
		let windowId = tab.windowId;

		try {
			if (tab.groupId == activeGroup[windowId]) {
				await browser.tabs.show(tabId);
			}
			else {
				await browser.tabs.hide(tabId);
			}
		}
		catch (e) {

		}
	}

	self.update = async function (windowId) {
		let array = windows[windowId];
		if (array == null) return;

		let activeId = activeGroup[windowId];

		let hide = [];
		let show = [];

		let n = array.length;

		for (var i = 0; i < n; i++) {
			let tab = array[i];

			if (tab.groupId == activeId) {
				show.push(tab.id);
			}
			else {
				hide.push(tab.id);
			}
		}

		await Promise.all([
			tryBrowserArrayOperation(hide
				, browser.tabs.hide)
			, tryBrowserArrayOperation(show
				, browser.tabs.show)
		]);
	}

	function correctIndexing(windowId, from = 0, to = null) {
		let array = windows[windowId];

		if (to == null) {
			to = array.length;

		}

		for (var i = from; i < to; i++) {
			array[i].index = i;
		}
	}

	self.onAttached = async function (tabId, info) {
		let tab = tabs[tabId];
		if (tab == null) return;

		let windowId = info.newWindowId;
		let index = info.newPosition;

		await createWindow(windowId);

		// remove object from old array
		let array = windows[tab.windowId];
		array.splice(tab.index, 1);
		correctIndexing(tab.windowId, tab.index);

		// insert to new window
		array = windows[windowId];
		array.splice(index, 0, tab);
		correctIndexing(windowId, index);

		// update windowId
		tab.windowId = windowId;
		await updateTab(tabId);
	}

	self.onMoved = function (tabId, info) {
		let tab = tabs[tabId];
		if (tab == null) {
			return;
		}

		let windowId = info.windowId;
		let fromIndex = info.fromIndex;
		let toIndex = info.toIndex;

		let array = windows[windowId];

		array.splice(fromIndex, 1);
		array.splice(toIndex, 0, tab);

		correctIndexing(windowId, Math.min(fromIndex, toIndex)
			, Math.max(fromIndex, toIndex) + 1);
	}

	async function createWindow(windowId) {
		if (windows[windowId] != null) return;
		windows[windowId] = [];
		let grpIfc = await groupInterface(windowId);
		groups[windowId] = grpIfc;

		activeGroup[windowId] = await browser.sessions.getWindowValue(windowId, 'activeGroup');
		if (activeGroup[windowId] == null) {
			activeGroup[windowId] = grpIfc.getByIndex(0).id;
		}
	}

	function swapTabObject(oldTab, tab) {
		tab.groupId = oldTab.groupId;

		if (oldTab.windowId == tab.windowId &&
			oldTab.index == tab.index) {
			return tab;
		}

		windows[oldTab.windowId].splice(oldTab.index, 1);
		correctIndexing(oldTab.windowId);

		tabs[tab.id] = tab;
		windows[tab.windowId].splice(tab.index, 0, tab);
		correctIndexing(tab.windowId);
		return tab;
	}

	self.onCreated = async function (tab, groupId) {
		let tabId = tab.id;
		let oldTab = tabs[tabId];
		if (oldTab != null) {
			if (oldTab.groupId != null) {
				swapTabObject(oldTab, tab);
			}

			return;
		}

		try {
			if (groupId == null)
			groupId = await browser.sessions.getTabValue(tabId, 'groupId');
		}
		catch (e) {
			console.log(e);
			return;
		}

		let windowId = tab.windowId;

		await createWindow(windowId);

		let array = windows[windowId];
		let startLength = array.length;

		tab.groupId = groupId;

		array.splice(tab.index, 0, tab);
		correctIndexing(windowId, tab.index);
		tabs[tabId] = tab;

		if (groupId == null) {
			await self.setGroupId(tabId, activeGroup[windowId]);
		}
		else {
			if (tab.active) {
				await self.update(windowId);
			}
			else {
				await updateTab(tabId);
			}
		}

		return tab;
	}

	self.onRemoved = function (tabId, info) {
		let tab = tabs[tabId];
		if (tab == null) return;

		let windowId = info.windowId;
		let index = tab.index;

		windows[windowId].splice(index, 1);
		delete tabs[tabId];

		correctIndexing(windowId, index);
	}

	self.onUpdated = function (tab) {
		let oldTab = tabs[tab.id];
		if (oldTab == null) return;
		return swapTabObject(oldTab, tab);
	}

	self.setGroupId = async function (tabId, groupId) {
		if (Number.isInteger(groupId) == false) {
			throw new Error(`attempted to set the groupId of tab ${tabId} to ${groupId}`);
		}

		let referenceTab = Array.isArray(tabId) ? tabs[tabId[0]] : tabs[tabId];
		if (referenceTab == null) {
			throw new Error(`null reference tab, tabId ${tabId}, groupId ${groupId}`);
		}

		let windowId = referenceTab.windowId;

		if (groupId == null || groupId >= 0 &&
			(groups[windowId] == null || groups[windowId].get(groupId) == null)) {
			return;
		}

		if (Array.isArray(tabId)) {
			let n = tabId.length;

			for (var i = 0; i < n; i++) {
				var tab = tabs[tabId[i]];
				if (tab == null || tab.groupId == groupId) {
					continue;
				}

				tab.groupId = groupId;

				browserQueue.do(null, async function () {
					await browser.sessions.setTabValue(tab.id
						, 'groupId', groupId);
				});
			}

			await self.update(windowId);
		}
		else {
			var tab = tabs[tabId];
			if (tab == null || tab.groupId == groupId) return;

			tab.groupId = groupId;
			browserQueue.do(null, async function () {
				await browser.sessions.setTabValue(tab.id
					, 'groupId', groupId);
			});

			await updateTab(tabId);
		}
	}

	self.get = function (tabId) {
		return tabs[tabId];
	}

	self.getGroupId = function (tabId) {
		let tab = tabs[tabId];
		if (tab == null) return null;
		else return tab.groupId;
	}

	self.setActiveGroup = async function (windowId, groupId) {
		if (groupId < 0) return;

		let grpIfc = groups[windowId];

		if (grpIfc != null && grpIfc.get(groupId) != null &&
			activeGroup[windowId] != groupId &&
			grpIfc.get(groupId).stash == false) {

			activeGroup[windowId] = groupId;
			browserQueue.do(null, async function () {
				await browser.sessions.setWindowValue(windowId, 'activeGroup', groupId);
			});

			// grpIfc.setStash(groupId, false);
			await self.update(windowId);
		}
	}

	self.getActiveGroupId = function (windowId) {
		return activeGroup[windowId];
	}

	self.getGroupInterface = function (windowId) {
		return groups[windowId];
	}

	self.getGroup = function (windowId, id) {
		let grpIfc = groups[windowId];

		if (grpIfc == null) {
			return null;
		}
		else {
			return grpIfc.get(id);
		}
	}

	self.forEach = async function (callback, windowId = null, groupId = null) {
		let promises = [];
		let iterable;
		if (windowId != null) {
			iterable = windows[windowId];
			if (iterable == null) {
				return;
			}
		}
		else {
			iterable = tabs;
		}

		for (var key in iterable) {
			var tab = iterable[key];
			if (groupId != null && tab.groupId != groupId) continue;

			promises.push(callback(tab));
		}

		await Promise.all(promises);
	}

	self.forEachWindow = async function (callback) {
		let promises = [];

		for (var key in windows) {
			promises.push(callback(key));
		}

		await Promise.all(promises);
	}

	{
		let allTabs = await browser.tabs.query({});
		let n = allTabs.length;

		let promises = [];
		for (var i = 0; i < n; i++) {
			var tab = allTabs[i];
			await createWindow(tab.windowId);
			promises.push(self.onCreated(tab));
		}

		await Promise.all(promises);
	}

	queue.onComplete(async function () {
		for (var key in Object.keys(updateWindows)) {
			await self.update(key);
		}

		updateWindows = {};
	});

	return self;
}