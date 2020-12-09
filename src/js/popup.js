'use strict';

let nodes = [];
let groupsHolder;
let stashHolder;
let stashTitle;
let numKeyEnabled = false;
var numKeyTargets = [];

let WINDOW_ID;
let bgPage;
let TABINTERFACE;
let GRPIFC;

async function init() {
	bgPage = browser.extension.getBackgroundPage();
	WINDOW_ID = (await browser.windows.getCurrent()).id;
	TABINTERFACE = await bgPage.registerPopup();
	GRPIFC = TABINTERFACE.getGroupInterface(WINDOW_ID);

	let promises = [
		browser.storage.local.get().then(config => {
			numKeyEnabled = config.use_panel_numkey || false;
			switch(config.theme) {
				case ThemeOption.System:
					if (window.matchMedia('(prefers-color-scheme: light)').matches) {
						appendCSSFile('css/color-light.css');
					}
					break;
				case ThemeOption.Dark:
					break;
				case ThemeOption.Light:
					appendCSSFile('css/color-light.css');
					break;
			}
			appendCSS(config.popup_css);
		})
		, makeGroupNodes()
	];

	let toolbar = document.getElementById('toolbar');

	let settings = new_element('div', {
		class: 'icon icon-settings'
		, title: 'Go to groups view.'
	});

	settings.addEventListener('click', async function (event) {
		event.stopPropagation();
		let view = bgPage.getView(WINDOW_ID);
		if (view != null) {
			try {
				browser.tabs.update(view.tabId, {
					active: true
				})
			}
			catch (e) {
				console.log(e);
			}
		}
		else {
			await bgPage.enqueueTask(bgPage.openView, WINDOW_ID);
		}
		window.close();
	});

	await Promise.all(promises);

	document.addEventListener('keypress', async function(event) {
		let num = Number(event.key);

		if (num == NaN || !numKeyEnabled) {
			return;
		}

		await bgPage.enqueueTask(async function () {
			await bgPage.switchToGroup(WINDOW_ID, numKeyTargets[num]);
		});

		window.close();
	});

	toolbar.appendChild(settings);
	groupsHolder = document.getElementById('groups');
	stashHolder = document.getElementById('stash');
	stashTitle = document.getElementById('stash-title');

	await updateGroupNodes();
	updateActive();
}

function updateActive() {
	let activeId = TABINTERFACE.getActiveGroupId(WINDOW_ID);

	nodes.forEach(function (node) {
		setNodeClass(node.text, 'active', node.id == activeId);
	});
}

async function makeGroupNodes() {
	await GRPIFC.forEach(function (group) {
		async function selectNode(event) {
			event.stopPropagation();
			if (group.stash) {
				return;
			}
			await bgPage.enqueueTask(async function () {
				await bgPage.switchToGroup(WINDOW_ID, group.id);
			});

			window.close();
		}
		async function unstashNode(event) {
			event.stopPropagation();

			await bgPage.enqueueTask(bgPage.setStash, WINDOW_ID, group.id, false);
			nodes[group.id].stash = false;
			updateGroupNodes();
		}

		let text = new_element('div', {
			class: 'name'
			, content: group.name
		});

		let unstash = new_element('div', {
			class: 'icon icon-unstash'
			, title: 'Unstash this group.'
		});

		let node = new_element('div', {
			class: 'group'
			, tabindex: group.id + 1
		}, [text, unstash]);

		unstash.addEventListener('click', async function (event) {
			unstashNode(event);
		});

		node.addEventListener('keypress', async function (event) {
			if (event.keyCode === 13) {
				if (group.stash) {
					unstashNode(event);
				} else {
				selectNode(event);
				}
			}
		});

		node.addEventListener('click', async function (event) {
			selectNode(event);
		});

		let groupNode = {
			id: group.id
			, stash: group.stash
			, html: node
			, name: group.name
			, text: text
			, button: unstash
		}

		nodes[group.id] = groupNode;
	});
}

async function updateGroupNodes() {
	numKeyTargets = [];
	numKeyTargets[0] = "-1";

	await GRPIFC.forEach(function (group) {
		let node = nodes[group.id];

		if (node.stash) {
			stashHolder.appendChild(node.html);
		}
		else {
			if (numKeyEnabled && numKeyTargets.length < 10) {
				let i = (numKeyTargets.length % 10);
				numKeyTargets[i] = node.id;
				node.text.innerHTML = `[${i}] ${node.name}`;
			}


			groupsHolder.appendChild(node.html);
		}
	});

	setNodeClass(stashTitle, 'hidden', stashHolder.childElementCount == 0);
}

document.addEventListener('DOMContentLoaded', init, false);
