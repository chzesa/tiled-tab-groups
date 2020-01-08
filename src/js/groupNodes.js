'use strict';

var groupNodes = {};
var pinned = document.getElementById('pinnedTabs');

function makeGroupNode(group) {
	if (groupNodes[group.id] != null) {
		return groupNodes[group.id];
	}
	// Header
	var input = new_element('input', {
		type: 'text'
		, value: group.name
	, });
	var tabCount = new_element('span', {
		class: 'tab_count'
		, content: group.tabCount
		, title: 'Group Tabs Counter.'
	});
	var reload = new_element('div', {
		class: 'icon icon-reload'
		, title: 'Reload tabs in this group.'
	, });
	var unload = new_element('div', {
		class: 'icon icon-unload'
		, title: 'Unload tabs in this group.'
	, });
	var stash = new_element('div', {
		class: 'icon icon-stash'
		, title: 'Stash this group. Unloads all tabs in the group.'
	, });
	var close = new_element('div', {
		class: 'icon icon-close'
		, title: 'Remove this group and close all tabs within it.'
	, });

	// float:right reverses order, add close first
	var header = new_element('div', {
		class: 'header'
	}, [input, close, stash, unload, reload, tabCount]);

	// Content
	var newtab = new_element('div', {
		class: 'newtab'
		, title: 'Create a new tab in this group and switch to it.'
	, });
	var scroll_padding = new_element('div', {
		class: 'scroll_padding'
	});

	var content = new_element('div', {}); // tab container

	var content_wrap = new_element('div', {
		class: 'content'
		, groupId: group.id
	}, [content, newtab, scroll_padding]);

	content_wrap.addEventListener('dragover', groupDragOver, false);
	content_wrap.addEventListener('drop', groupDrop, false);

	var node = new_element('div', {
		class: 'group'
	}, [header, content_wrap]);

	Object.assign(node.style, {
		willChange: 'transform'
	, });

	groupNodes[group.id] = {
		group: node
		, content: content
		, newtab: newtab
		, tabCount: tabCount
	};

	// Event handlers
	close.addEventListener('click', function (event) {
		event.stopPropagation();

		let tabCount = tabsInGroup(group.id)

		if (tabCount > 0 && !window.confirm(
				`Closing this group will close the ${tabCount} ` +
				`tab${(tabCount == 1 ? '' : 's')} within it.`)) {
			return;
		}

		bgPage.deleteGroup(WINDOW_ID, group.id);
	}, false);

	content_wrap.addEventListener('click', function (event) {
		event.stopPropagation();
	}, false);

	newtab.addEventListener('click', async function (event) {
		event.stopPropagation();

		bgPage.enqueueTask(async function () {
			await TABINTERFACE.setActiveGroup(WINDOW_ID, group.id);
			await browser.tabs.create({
				active: true
			});
		});
	}, false);

	input.addEventListener('blur', function (event) {
		GRPINTERFACE.rename(group.id, this.value);
		group.name = this.value;
	}, false);

	unload.addEventListener('click', function (event) {
		event.stopPropagation();

		if (window.confirm(`Unload group ${group.name}?`)) {
			bgPage.unloadGroup(WINDOW_ID, group.id)
		}
	}, false);

	stash.addEventListener('click', async function (event) {
		event.stopPropagation();

		var groupUnloaded = true;

		await TABINTERFACE.forEach(function (tab) {
			if (!tab.discarded && !tab.pinned) {
				groupUnloaded = false;
			}
			}, WINDOW_ID,
			function (tab) {
				return group.id == TABINTERFACE.getGroupId(tab.id)
			}
		);

		if (groupUnloaded || window.confirm(`Stash group ${group.name}?\n` +
				`Stashed groups can be retrieved from the popup panel.`)) {
			bgPage.enqueueTask(bgPage.setStash, WINDOW_ID, group.id, true);
		}

	}, false);

	reload.addEventListener('click', async function (event) {
		event.stopPropagation();

		let tabCount = tabsInGroup(group.id)

		if (window.confirm(`Reload ${tabCount} tab${tabCount == 1 ? '' : 's'} ` +
				`in group ${group.name}?`)) {

			await TABINTERFACE.forEach(async function (tab) {
				if (tab.pinned) return;
				browser.tabs.reload(tab.id);
				}, WINDOW_ID,
				function (tab) {
					return group.id == TABINTERFACE.getGroupId(tab.id)
				}
			);
		}

	}, false);

	return groupNodes[group.id];
}

function tabsInGroup(pGroupId) {
	return groupNodes[pGroupId].content.childNodes.length;
}

async function fillGroupNodes() {
	var fragment = {};
	let pinFrag = document.createDocumentFragment();

	await GRPINTERFACE.forEach(async function (group) {
		if (group.stash) return;
		if (groupNodes[group.id] == null) {
			makeGroupNode(group);
		}

		fragment[group.id] = document.createDocumentFragment();
	});

	await TABINTERFACE.forEach(async function (tab) {
		let groupId = TABINTERFACE.getGroupId(tab.id);
		if (fragment[groupId] == null) return;
		makeTabNode(tab);

		if (tab.pinned) {
			pinFrag.appendChild(tabNodes[tab.id].tab);
		}
		else {
			fragment[groupId].appendChild(tabNodes[tab.id].tab);
		}

	}, WINDOW_ID);

	await GRPINTERFACE.forEach(function (group) {
		if (groupNodes[group.id] == undefined) {
			return;
		}
		setAsNthChild(fragment[group.id], groupNodes[group.id].content);
		updateTabCountById(group.id);
	})

	pinned.appendChild(pinFrag);
	Selected.requireUpdate();
}

function reorderGroup(groupId) {
	let group = GRPINTERFACE.get(groupId);
	if (!isGroupVisible(groupId)) {
		TABINTERFACE.forEach(function (tab) {
			deleteTabNode(tab.id);
		}, WINDOW_ID, tab => groupId == TABINTERFACE.getValue(tab.id, 'groupId'));
		Selected.requireUpdate();
		return;
	}

	let frag = document.createDocumentFragment();

	TABINTERFACE.forEach(function (tab) {
		if (tabNodes[tab.id] == null) {
			makeTabNode(tab);
			updateTabNode(tab.id);
		}

		if (!tab.pinned) {
			frag.appendChild(tabNodes[tab.id].tab);
		}

	}, WINDOW_ID, function(tab) {
		return groupId == TABINTERFACE.getValue(tab.id, 'groupId');
	});

	setAsNthChild(frag, groupNodes[groupId].content);
	updateTabCountById(groupId);
	Selected.requireUpdate();
}

function insertTab(tab, groupId = null) {
	if (groupId == undefined) {
		groupId = TABINTERFACE.getGroupId(tab.id);
	}

	if (groupId != -1) {
		groupNodes[groupId].content.appendChild(tabNodes[tab.id].tab);
		updateTabCountById(groupId);
		reorderGroup(groupId);
		Selected.requireUpdate();
	}
}

function updateTabCountById(groupId) {
	let node = groupNodes[groupId];
	if (node == null) {
		return;
	}

	node.tabCount.innerHTML = '';
	node.tabCount.appendChild(
		document.createTextNode(node.content.childNodes.length)
	);
}