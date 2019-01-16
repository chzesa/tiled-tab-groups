'use strict';

let nodes = [];
let groupsHolder;
let stashHolder;
let stashTitle;
let numKeyEnabled = false;
var numKeyTargets = [];

async function init() {
	let promises = [
		browser.storage.local.get().then(v => {
			numKeyEnabled = v.use_panel_numkey || false;
			if (v.light_theme) {
				appendCSSFile('css/color-light.css');
			}
			appendCSS(v.popup_css);
		})
		, makeGroupNodes()
	];

	let toolbar = document.getElementById('toolbar');

	let settings = new_element('div', {
		class: 'icon icon-settings'
		, title: 'Go to groups view.'
	});

	let reinit = new_element('div', {
		class: 'icon icon-loader'
		, title: "Reinitialize Tiled Tab Groups. This fixes most issues without having to restart the browser."
	});

	settings.addEventListener('click', function (event) {
		event.stopPropagation();
		commsOpenView();
		window.close();
	});

	reinit.addEventListener('click', function (event) {
		event.stopPropagation();
		commsReinit();
		window.close();
	});

	await Promise.all(promises);

	document.addEventListener('keypress', (event) => {
		let num = Number(event.key);

		if (num == NaN || !numKeyEnabled) {
			return;
		}

		commsSwitchToGroup(numKeyTargets[num]);
		window.close();
	});

	toolbar.appendChild(settings);
	toolbar.appendChild(reinit);
	groupsHolder = document.getElementById('groups');
	stashHolder = document.getElementById('stash');
	stashTitle = document.getElementById('stash-title');

	// await makeGroupNodes();
	updateGroupNodes();
	updateActive();
}

async function updateActive() {
	let activeId = await groups.getActive();

	nodes.forEach(node => {
		setNodeClass(node.text, 'active', node.id == activeId);
	})
}

async function makeGroupNodes() {
	await groups.init();

	groups.forEach(function (group) {
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
		}, [text, unstash]);

		unstash.addEventListener('click', async function (event) {
			event.stopPropagation();
			commsStashGroup(group.id, false);
			nodes[group.id].stash = false;
			updateGroupNodes();
		});

		node.addEventListener('click', async function (event) {
			event.stopPropagation();
			if (group.stash) {
				return;
			}
			commsSwitchToGroup(group.id);
			window.close();
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

	nodes.forEach(node => {
		if (node.stash) {
			stashHolder.appendChild(node.html);
		}
		else {
			if (numKeyEnabled) {
				if (numKeyTargets.length < 10) {
					let i = (numKeyTargets.length) % 10;
					numKeyTargets[i] = node.id;
					node.text.innerHTML = `[${i}] ${node.name}`;

				}
			}


			groupsHolder.appendChild(node.html);
		}
	});

	setNodeClass(stashTitle, 'hidden', stashHolder.childElementCount == 0);
}

document.addEventListener('DOMContentLoaded', init, false);