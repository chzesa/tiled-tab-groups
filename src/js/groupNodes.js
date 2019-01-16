'use strict';

var groupNodes = {};

async function initGroupNodes() {
	groups.forEach(function (group) {
		makeGroupNode(group);

		let parent = group.stash ? view.stashNode : view.groupsNode;
		parent.appendChild(groupNodes[group.id].group);
	});

	groupNodes.pinned = {
		content: document.getElementById('pinnedTabs')
	};
}

function tabsInGroup(pGroupId) {
	return groupNodes[pGroupId].content.childNodes.length;
}

function makeGroupNode(group) {
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

	// float:right reverses order, add close first to fix
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

	let ignoreAttrib = [input, reload, unload, stash, close, newtab];
	for (let i in ignoreAttrib) {
		ignoreAttrib[i].setAttribute('ignore', 't');
	}

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

		if (tabCount > 0) {
			if (window.confirm('Closing this Group will close the ' + tabCount + ' tab' + (tabCount == 1 ? '' : 's') +
					' within it')) {
				commsDeleteGroup(group.id);
				removeGroupNode(group.id);
			}
		}
		else {
			commsDeleteGroup(group.id);
			removeGroupNode(group.id);
		}
	}, false);

	content_wrap.addEventListener('click', function (event) {
		event.stopPropagation();
	}, false);

	newtab.addEventListener('click', async function (event) {
		event.stopPropagation();
		commsSetActive(group.id);
		await browser.tabs.create({
			active: true
		});
	}, false);

	input.addEventListener('blur', function (event) {
		commsRenameGroup(group.id, this.value);
	}, false);

	unload.addEventListener('click', function (event) {
		event.stopPropagation();

		if (window.confirm('Unload group ' + group.name + "?")) {
			commsUnloadGroup(group.id);
		}

	}, false);

	stash.addEventListener('click', async function (event) {
		event.stopPropagation();

		var groupUnloaded = true;

		await tabs.forEach(async function (tab) {
			if (!groupUnloaded) {
				return;
			}

			if (await tabs.getGroupId(tab.id) == group.id && !tab.discarded && !tab.pinned) {
				groupUnloaded = false;
			}
		});

		if (groupUnloaded || window.confirm('Stash group ' + group.name + "?\nStashed groups can be retrieved from the popup panel.")) {
			setGroupVisible(group.id, false);
			commsStashGroup(group.id, true);
		}

	}, false);

	reload.addEventListener('click', function (event) {
		event.stopPropagation();

		let tabCount = tabsInGroup(group.id)
		if (window.confirm('Reload ' + tabCount + ' tab' + (tabCount == 1 ? '' : 's') + ' in group ' + group.name + "?")) {
			commsReloadGroup(group.id);
		}

	}, false);
}

function removeGroupNode(groupId) {
	groupNodes[groupId].group.parentNode.removeChild(groupNodes[groupId].group);
	delete groupNodes[groupId];
	Selected.requireUpdate();
}

// https://stackoverflow.com/a/28213381
function eachAsync(pArray, pAsyncOperation) {
	let counter = 0;

	pArray.forEach(item => {
		pAsyncOperation(item, res => {
			counter += 1;
			if (counter === arr.length) {
				return;
			}
		});
	});
}

let groupIds = {};
async function prefetchGroupIds() {
	await browser.tabs.query({
		currentWindow: true
	}).then(pTabs => {
		eachAsync(pTabs, async pTab => {
			groupIds[pTab.id] = await tabs.getGroupId(pTab.id);
		});
	});
}

async function fillGroupNodes() {
	var fragment = {
		pinned: document.createDocumentFragment()
	, };

	groups.forEach(function (group) {
		fragment[group.id] = document.createDocumentFragment();
	});

	let getGroupId;

	if (groupIds.length == 0) {
		getGroupId = async function (pTabId) {
			return await tabs.getGroupId(pTabId);
		}
	}
	else {
		getGroupId = async function (pTabId) {
			let groupId = groupIds[pTabId];
			if (groupId == undefined) {
				groupId = await tabs.getGroupId(pTabId);
			}
			return groupId;
		}
	}

	await tabs.forEach(async function (tab) {
		if (!tab.pinned) {
			let groupId = await getGroupId(tab.id);
			if (groupId != -1 && fragment[groupId]) {
				fragment[groupId].appendChild(tabNodes[tab.id].tab);
			}
		}
		else {
			fragment.pinned.appendChild(tabNodes[tab.id].tab);
		}
	});

	groupIds = {};

	groups.forEach(function (group) {
		if (groupNodes[group.id] == undefined) {
			return;
		}
		setAsNthChild(fragment[group.id], groupNodes[group.id].content);
		markGroupDisorderly(group.id);
		markGroupRecount(group.id);
	});

	groupNodes.pinned.content.appendChild(fragment.pinned);
	Selected.requireUpdate();
}

async function setGroupVisible(id, state) {
	let node = groupNodes[id];
	if (state) {
		let nth = 0;

		for (let k in groupNodes) {
			if (k == "pinned") { // hack
				continue;
			}

			if (groupNodes[k].group.parentNode == view.stashNode) {
				continue;
			}

			if (k < id) {
				nth++;
			}
			else {
				break;
			}
		}

		setAsNthChild(node.group, view.groupsNode, nth);
	}
	else {
		view.stashNode.appendChild(node.group);
	}

	Selected.requireUpdate();
}

async function reorderGroup(groupId) {
	if (groupId < 0) {
		return;
	}

	let tabInfo = [];
	let grp = groupNodes[groupId];
	if (grp == null) {
		return;
	}
	let childNodes = grp.content.childNodes;
	let n = childNodes.length;

	let for_deletion = [];

	for (var i = 0; i < n; i++) {
		if (childNodes[i] == null) {
			continue;
		}

		let _tabId = Number(childNodes[i].getAttribute('tabId'));

		try {
			let _tab = await browser.tabs.get(_tabId);
			tabInfo.push({
				index: _tab.index
				, id: _tab.id
				, node: childNodes[i]
			});
		}
		catch (e) {
			console.log(e);
			for_deletion.push(_tabId);
		}
	}

	for (var i in for_deletion) {
		deleteTabNode(for_deletion[i]);
	}

	tabInfo.sort((a, b) => {
		return a.index - b.index;
	});

	let sortedGroup = document.createDocumentFragment();

	for (let i = 0; i < tabInfo.length; i++) {
		sortedGroup.appendChild(tabInfo[i].node);
	}

	setAsNthChild(sortedGroup, groupNodes[groupId].content, 0);
}

async function insertTabCmd(args) {
	let groupId = await args[1];
	await insertTab(args[0], groupId);
}

async function insertTab(tab, groupId = undefined) {
	if (groupId === undefined) {
		cmd_que.do([tab, tabs.getGroupId(tab.id)], insertTabCmd, true);
		return;
	}

	if (groupId != -1) {
		setAsNthChild(tabNodes[tab.id].tab, groupNodes[groupId].content, 0);

		markGroupDisorderly(groupId);
		markGroupRecount(groupId);
		Selected.requireUpdate();
	}
}

function updateTabCount(group) {
	if (group == undefined) {
		return;
	}

	updateTabCountById(group.id);

	var node = groupNodes[group.id];
}

function updateTabCountById(id) {
	let node = groupNodes[id];
	if (node == null) {
		return;
	}

	node.tabCount.innerHTML = '';
	node.tabCount.appendChild(
		document.createTextNode(node.content.childNodes.length)
	);
}