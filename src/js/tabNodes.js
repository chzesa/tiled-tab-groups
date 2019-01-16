'use strict';

const tabNodes = {};
var tab_node_pool_anchor;
const tab_node_pool = [];

async function initTabNodes() {
	tab_node_pool_anchor = document.getElementById('tab-pool');
	await tabs.forEach(async function (tab) {
		await makeTabNode(tab);
	});
}

async function makeTabNode(tab) {
	let tab_object;

	if (tab_node_pool.length > 0) {
		tab_object = tab_node_pool.pop();
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

	updateTabNode(tab);
	updateFavicon(tab);
}

async function updateTabNode(tab) {
	var node = tabNodes[tab.id];

	if (node) {
		node.name.innerHTML = '';
		node.name.appendChild(document.createTextNode(tab.title));

		node.title = `${tab.title} - ${tab.url}`;

		setNodeClass(node.tab, 'inactive', tab.discarded);
	}
}

async function updateIndent(pTabId) {
	if (use_tst_indent) {
		let node = tabNodes[pTabId];
		if (!node) return;

		setTimeout(async function () {
			try {
				let depth = await getTreeStyleTabIndent(pTabId);
				node.tab.style.marginLeft = `${depth * 8}px`;
			}
			catch (e) {
				console.log(e);
			}
		}, 500);
	}
	else if (use_ftt) {
		let node = tabNodes[pTabId];
		if (!node) return;
		let depth = 0;
		try {
			depth = await getFttIndent(pTabId);
		}
		catch (e) {
			console.log(e);
		}

		node.tab.style.marginLeft = `${depth * 8}px`;
	}
}

async function getFttIndent(tabId) {
	let depth = 0;
	try {
		var nfo = await browser.runtime.sendMessage("{8d808887-ed13-4931-9f5a-4c0bff979a5a}", {
			tab: tabId
		});
		depth = nfo.parents.length || 0;
	}
	catch (e) {}

	if (depth > 0 && await tabs.getGroupId(tabId) != await tabs.getGroupId(nfo.parents[0])) {
		depth = 0;
	}

	return depth;
}

async function getTreeStyleTabIndent(pTabId) {
	let depth;
	try {
		const kTST_ID = 'treestyletab@piro.sakura.ne.jp';
		var tst_info = await browser.runtime.sendMessage(kTST_ID, {
			type: 'get-tree'
			, tab: pTabId
		});

		depth = tst_info.ancestorTabIds.length || 0;
	}
	catch (e) {
		return 0;
	}

	if (depth > 0 && await tabs.getGroupId(pTabId) != await tabs.getGroupId(tst_info.ancestorTabIds[0])) {
		depth = 0;
	}

	return depth;
}

var last_active_node;
async function setActiveTabNode() {
	if (last_active_node != null) {
		last_active_node.classList.remove('selected');
	}

	let activeTab = (await browser.tabs.query({
		active: true
		, currentWindow: true
	}))[0];

	let id;

	if (activeTab.id == view.tabId) {
		let tabs = await browser.tabs.query({
			hidden: false
			, currentWindow: true
		});

		let lastAccessed = 0;
		id = -1;

		for (let i in tabs) {
			let tab = tabs[i];
			if (tab.lastAccessed > lastAccessed && tab.id != view.tabId) {
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

function deleteTabNode(tabId) {
	if (tabNodes[tabId] != null) {
		let tab_object = tabNodes[tabId];
		delete tabNodes[tabId];
		tab_object.tab.removeAttribute('tabId');
		tab_object.id = -1;
		tab_node_pool_anchor.appendChild(tab_object.tab);
		tab_node_pool.push(tab_object);
		Selected.removeSelectable(tabId);
	}
}

async function updateFavicon(tab) {
	var node = tabNodes[tab.id];

	if (node) {
		if (tab.favIconUrl && tab.favIconUrl != node.favicon.style.backgroundImage)
		node.favicon.style.backgroundImage = `url(${tab.favIconUrl})`;
		else
		node.favicon.style.backgroundImage = '';
	}
}