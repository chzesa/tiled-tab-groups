'use strict';

const tabNodes = {};
const tab_node_pool = [];
var tab_node_pool_anchor;
var last_active_node;
var updateIndent;

function makeTabNode(tab) {
	let tab_object = tabNodes[tab.id];
	if (tab_object != null) {
		return tab_object;
	}

	tab_object = tab_node_pool.pop();

	if (tab_object != null) {
		tab_object.id = tab.id;
		tab_object.tab.setAttribute('tabId', tab.id);
	}
	else {
		var favicon = new_element('div', {
			class: 'favicon'
		});

		var name = new_element('div', {
			class: 'name'
		});

		var close = new_element('div', {
			class: 'icon icon-close'
			, title: 'Close Tab'
		});

		var node = new_element('div', {
			class: 'tab'
			, draggable: 'true'
			, tabId: tab.id
		}, [favicon, name, close]);

		tab_object = {
			tab: node
			, id: tab.id
			, favicon: favicon
			, close: close
			, name: name
		};

		node.addEventListener('dragstart', tabDragStart, false);
		node.addEventListener('dragenter', tabDragEnter, false);
		node.addEventListener('dragover', tabDragOver, false);
		node.addEventListener('dragleave', tabDragLeave, false);
		node.addEventListener('drop', tabDrop, false);
		node.addEventListener('dragend', tabDragEnd, false);

		node.addEventListener('click', async function (event) {
			event.preventDefault();
			event.stopPropagation();
			try {
				browser.tabs.update(tab_object.id, {
					active: true
				});
			}
			catch (e) {
				console.log(e);
				deleteTabNode(tab_object.id);
			}

		}, false);

		close.addEventListener('click', async function (event) {
			event.stopPropagation();
			if (use_tst_tree_close) {
				const kTST_ID = 'treestyletab@piro.sakura.ne.jp';
				await browser.runtime.sendMessage(kTST_ID, {
					type: 'expand-tree'
					, tab: tab_object.id
				});
			}

			try {
				browser.tabs.remove(tab_object.id);
			}
			catch (e) {
				console.log(e);
				deleteTabNode(tab_object.id);
			}

		}, false);
	}

	tabNodes[tab.id] = tab_object;
	return tab_object;
}

function deleteTabNode(tabId) {
	let tab_object = tabNodes[tabId];
	if (tab_object == null) return;

	delete tabNodes[tabId];
	tab_object.tab.removeAttribute('tabId');
	tab_object.id = -1;
	tab_node_pool_anchor.appendChild(tab_object.tab);
	tab_node_pool.push(tab_object);
	Selected.removeSelectable(tabId);
}

function partialUpdate(tab, info) {
	let node = tabNodes[tab.id];
	if (node == null) return;

	if (info.title) {
		node.name.innerHTML = '';
		node.name.appendChild(document.createTextNode(tab.title));
	}

	if (info.favIconUrl) {
		if (tab.favIconUrl && tab.favIconUrl != node.favicon.style.backgroundImage) {
			node.favicon.style.backgroundImage = `url(${tab.favIconUrl})`;
		}
		else {
			node.favicon.style.backgroundImage = '';
		}
	}

	if (info.discarded != null) {
		setNodeClass(node.tab, 'inactive', tab.discarded);
	}
}

function updateTabNode(tab) {
	let node = tabNodes[tab.id];
	if (node == null) return;

	node.name.innerHTML = '';
	node.name.appendChild(document.createTextNode(tab.title));

	setNodeClass(node.tab, 'inactive', tab.discarded);

	if (tab.favIconUrl && tab.favIconUrl != node.favicon.style.backgroundImage)
	node.favicon.style.backgroundImage = `url(${tab.favIconUrl})`;
	else
	node.favicon.style.backgroundImage = '';
	return;
}

async function setActiveTabNode() {
	if (last_active_node != null) {
		last_active_node.classList.remove('selected');
	}

	let activeTab = (await browser.tabs.query({
		active: true
		, currentWindow: true
	}))[0];

	let id;

	if (activeTab.id == TAB_ID) {
		let tabs = await browser.tabs.query({
			hidden: false
			, currentWindow: true
		});

		let lastAccessed = 0;
		id = -1;

		for (var i in tabs) {
			var tab = tabs[i];
			if (tab.lastAccessed > lastAccessed && tab.id != TAB_ID) {
				lastAccessed = tab.lastAccessed;
				id = tab.id;
			}
		}
	}
	else {
		id = activeTab.id;
	}

	if (tabNodes[id] == null) {
		return;
	}
	last_active_node = tabNodes[id].tab;
	last_active_node.classList.add('selected');
}

async function updateIndentFtt(tabId) {
	let node = tabNodes[tabId];
	if (node == null) return;
	let depth = 0;
	try {
		var info = await browser.runtime.sendMessage("{8d808887-ed13-4931-9f5a-4c0bff979a5a}", {
			tab: tabId
		});
		depth = info.parents.length || 0;
	}
	catch (e) {

	}

	if (depth > 0 &&
		TABINTERFACE.getGroupId(tabId) != TABINTERFACE.getGroupId(info.parents[0])) {
		depth = 0;
	}

	node = tabNodes[tabId];
	if (node != null) {
		node.tab.style.marginLeft = `${depth * 8}px`;
	}
}

async function updateIndentTst(tabId) {
	let node = tabNodes[tabId];
	if (node == null) return;

	let depth = 0;

	setTimeout(async function () {
		try {
			const kTST_ID = 'treestyletab@piro.sakura.ne.jp';
			var info = await browser.runtime.sendMessage(kTST_ID, {
				type: 'get-tree'
				, tab: tabId
			});

			depth = info.ancestorTabIds.length || 0;
		}
		catch (e) {
			console.log(e);
		}
	}, 500);

	if (depth > 0 &&
		TABINTERFACE.getGroupId(tabId) != TABINTERFACE.getGroupId(info.ancestorTabIds[0])) {
		depth = 0;
	}

	node = tabNodes[tabId];
	if (node != null) {
		node.tab.style.marginLeft = `${depth * 8}px`;
	}
}