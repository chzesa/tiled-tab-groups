function formatByteSize(bytes) {
	if (bytes < 1024) return bytes + " bytes";
	else if (bytes < 1048576) return (bytes / 1024).toFixed(3) + " KiB";
	else if (bytes < 1073741824) return (bytes / 1048576).toFixed(3) + " MiB";
	else return (bytes / 1073741824).toFixed(3) + " GiB";
};

/*function convertBackup(tgData) {

	var data = {
		file: {
			type: 'panoramaView',
			version: 1
		},
		windows: []
	};

	for(var wi in tgData.windows) {

		const tabviewGroup = JSON.parse(tgData.windows[wi].extData['tabview-group']);
		const tabviewGroups = JSON.parse(tgData.windows[wi].extData['tabview-groups']);

		data.windows[wi] = {groups: [], tabs: [], activeGroup: tabviewGroups.activeGroupId, groupIndex: tabviewGroups.nextID};

		for(const gkey in tabviewGroup) {
			data.windows[wi].groups.push({
				id: tabviewGroup[gkey].id,
				name: tabviewGroup[gkey].title,
				rect: {x: 0, y: 0, w: 0.25, h: 0.5},
			});
		}

		for(const ti in tgData.windows[wi].tabs) {

			var tab = tgData.windows[wi].tabs[ti];

			data.windows[wi].tabs.push({
				url: tab.entries[0].url,
				title: tab.entries[0].title,
				favIconUrl: tab.image,
				groupId: JSON.parse(tab.extData['tabview-tab']).groupID,
				index: Number(ti),
				lastAccessed: tab.lastAccessed,
				pinned: false,
			});
		}
	}

	return data;
}

async function openBackup(data) {

	for(var wi in data.windows) {

		var groups = [];

		for(var gi in data.windows[wi].groups) {
			groups.push({
				id: data.windows[wi].groups[gi].id,
				name: data.windows[wi].groups[gi].name,
				containerId: 'firefox-default',
				rect: data.windows[wi].groups[gi].rect,
				tabCount: 0,
			});
		}

		const window = await browser.windows.create({});

		browser.sessions.setWindowValue(window.id, 'groups', groups);
		browser.sessions.setWindowValue(window.id, 'activeGroup', data.windows[wi].activeGroup);
		browser.sessions.setWindowValue(window.id, 'groupIndex', data.windows[wi].groupIndex);

		for(var ti in data.windows[wi].tabs) {

			var tab = await browser.tabs.create({
				url: data.windows[wi].tabs[ti].url
			});

			browser.sessions.setTabValue(tab.id, 'groupId', data.windows[wi].tabs[ti].groupId);
		}
	}
}

function loadBackup(input) {

	const file = input.target.files[0];

	if(file.type == 'application/json') {

		const reader = new FileReader();

		reader.onload = function(json) {
			var data = JSON.parse(json.target.result);

			// panorama view backup
			if(data.file && data.file.type == 'panoramaView' && data.file.version == 1) {

				// nothing to do..

			// if it's a tab groups backup
			}else if(data.version && data.version[0] == 'tabGroups' && data.version[1] == 1) {
				data = convertBackup(data);
			}else{
				alert('Invalid file');
				return;
			}

			//console.log(JSON.stringify(data, null, 4));
			openBackup(data);
		};

		reader.readAsText(file);
	}else{
		alert('Invalid file');
	}
}*/

function makeDateString() {

	var pad = function (num) {
		var s = '00' + num;
		return s.substr(-2);
	};

	var date = new Date();
	var string = '';

	string += pad(date.getFullYear());
	string += pad(date.getMonth() + 1);
	string += pad(date.getDate());
	string += '-';
	string += pad(date.getHours());
	string += pad(date.getMinutes());
	string += pad(date.getSeconds());

	return string;
}

async function insertGroupInfo() {
	const anchor = document.getElementById('group-info');

	await groups.init();

	groups.forEach(function (group) {
		var info = new_element('span', {
			class: ''
			, content: `Id '${group.id}' name: '${group.name}' (window: '${group.windowId}'), stashed: ${group.stash}`
		});
		var node = new_element('div', {
			class: ''
		}, [info]);

		anchor.appendChild(node);
		// }
	});
}

let regexSpecialCharacters = /'\[|\]|\(|\)|\{|\}|\\|\.|\^|\$|\+|\?|\|'/;

function wildcardToRegex(str) {
	let ret = "";

	for (let i = 0; i < str.length; i++) {
		let c = str.charAt(i);
		if (regexSpecialCharacters.test(c)) {
			ret += '\\' + c;
		}
		else if (c == "*") {
			ret += '.*';
		}
		else {
			ret += c;
		}
	}

	return ret;
}

var rules = [];

// Last edit values:
// 0 = default
// 1 = regex
// 2 = wildcard

async function newRule(str) {
	let config = await browser.storage.local.get();

	var rule = {
		regex: str || ""
		, wildcard: ""
		, lastEdit: 0
		, id: config.regex_nextId
		, matchId: true
		, matchTitle: false
		, matchUrl: true
		, targetId: 0
		, targetTitle: ""
	, }

	rules.push(rule);
	await browser.storage.local.set({
		"regex_nextId": config.regex_nextId + 1
	});

	await saveRules();
	updateRules();
}

async function saveRules() {
	let config = await browser.storage.local.get();
	let regexMode = config.regex_over_wildcard;

	for (let i = 0; i < rules.length; i++) {
		let r = rules[i];
		let wRegex = wildcardToRegex(r.wildcard);

		if (!regexMode) {
			if (r.lastEdit == 2) {
				r.regex = wRegex;
			}
		}
		else {
			if (r.lastEdit == 1) {
				r.wildcard = "";
			}
		}
	}

	await browser.storage.local.set({
		"rules": rules
	});

	commsUpdateCatchRules();
}

async function makeRuleNode(i, regexMode) {
	var rule = rules[i];

	if (regexMode == false && rule.lastEdit == 1) {
		return;
	}

	const anchor = document.getElementById('tab-catch-rules');

	var ruleUp = new_element('div', {
		title: 'Increase priority'
		, class: 'icon icon-arrow-up'
	});
	var ruleDown = new_element('div', {
		title: 'Decrease priority'
		, class: 'icon icon-arrow-down'
	});

	let arrowdiv = new_element('div', {
		class: 'arrow_button_container'
	}, [ruleUp, ruleDown]);


	var save = new_element('div', {
		title: 'Save changes'
		, class: 'icon icon-check hidden'
	});
	var cancel = new_element('div', {
		title: 'Revert changes'
		, class: 'icon icon-close hidden'
	});
	var edit = new_element('div', {
		title: 'Edit rule'
		, class: 'icon icon-edit'
	});
	var del = new_element('div', {
		title: 'Delete rule'
		, class: 'icon icon-delete'
	});

	let edit_button_container = new_element('div', {
		class: 'floatright'
	}, [edit, save, cancel, del]);

	// var matchLabel = new_element('label', {
	// 	content: 'Rule'
	// });
	var matchRule = new_element('input', {
		class: 'regex'
		, type: 'text'
		, placeholder: regexMode ? 'new regular expression' : 'new wildcard rule'
		, disabled: true
		// , value: rule.regex
		, value: regexMode ? rule.regex : rule.wildcard
	});

	var idLabel = new_element('label', {
		content: 'Target Group'
	});

	var matchId = new_element('input', {
		class: ''
		, type: 'text'
		, disabled: true
		, value: rule.targetId
	});

	// Dropdown
	let ind = [];

	let target_dropdown = new_element('select', {
		name: 'Target group'
		, disabled: true
	});

	let default_index = -1;

	groups.forEach(function (group) {
		let o = [group.name, group.id];
		ind.push(o);
		let option = document.createElement('option');
		option.text = group.name;
		target_dropdown.add(option);

		if (group.id == rule.targetId) {
			default_index = ind.length - 1;
		}
	});

	function reset_dropdown() {
		if (default_index == -1) {
			target_dropdown.value = '';
			default_value = '';
		}
		else {
			target_dropdown.value = ind[default_index][0];
		}
	}

	reset_dropdown();

	var testUrl = new_element('input', {
		type: 'checkbox'
		, disabled: true
		// , checked: rule.matchUrl
		, title: 'Check to compare this rule to tab url.'
	});

	testUrl.checked = rule.matchUrl;

	var testUrlLabel = new_element('label', {
		content: 'Test Url'
	});

	var testTitle = new_element('input', {
		type: 'checkbox'
		, disabled: true
		// , checked: rule.matchTitle
		, title: 'Check to compare this rule to page title.'
	});
	testTitle.checked = rule.matchTitle;

	var testTitleLabel = new_element('label', {
		content: 'Test Title'
	});

	edit.addEventListener('click', async function () {
		edit.classList.add('hidden');
		save.classList.remove('hidden');
		cancel.classList.remove('hidden');

		matchRule.disabled = false;
		matchId.disabled = false;
		testUrl.disabled = false;
		testTitle.disabled = false;
		target_dropdown.disabled = false;
	});

	cancel.addEventListener('click', async function () {
		edit.classList.remove('hidden');
		save.classList.add('hidden');
		cancel.classList.add('hidden');

		matchRule.disabled = true;
		matchId.disabled = true;
		testUrl.disabled = true;
		testTitle.disabled = true;
		target_dropdown.disabled = true;

		// matchRule.value = rule.regex;
		matchRule.value = regexMode ? rule.regex : rule.wildcard;
		matchId.value = rule.targetId;
		testUrl.checked = rule.matchUrl;
		testTitle.checked = rule.matchTitle;
		reset_dropdown();
	});

	save.addEventListener('click', async function () {
		let tar = Number(matchId.value);
		if (tar != NaN) {

			if (regexMode) {
				rule.regex = matchRule.value;
			}
			else {
				rule.wildcard = matchRule.value;
			}

			rule.lastEdit = regexMode ? 1 : 2;
			// rule.targetId = tar;
			rule.matchUrl = testUrl.checked;
			rule.matchTitle = testTitle.checked;

			rule.targetId = ind[target_dropdown.selectedIndex][1];

			matchRule.disabled = true;
			matchId.disabled = true;
			testUrl.disabled = true;
			testTitle.disabled = true;
			target_dropdown.disabled = true;
			edit.classList.remove('hidden');
			save.classList.add('hidden');
			cancel.classList.add('hidden');
			await saveRules();
		}
	});

	del.addEventListener('click', async function () {
		rules.splice(i, 1);
		await saveRules();
		updateRules();
	});

	ruleUp.addEventListener('click', async function () {
		if (i == 0) {
			return;
		}

		rules.splice(i, 1);
		rules.splice(i - 1, 0, rule);
		await saveRules();
		updateRules();
	});

	ruleDown.addEventListener('click', async function () {
		if (i == rules.length - 1) {
			return;
		}

		rules.splice(i, 1);
		rules.splice(i + 1, 0, rule);

		await saveRules();
		updateRules();
	});

	let wrap = new_element('div', {

	}, [matchRule, testUrl, testUrlLabel, testTitle, testTitleLabel, target_dropdown, idLabel, edit_button_container]);

	// var info = new_element('span', {class: '', content: `string '${rule.regex}' match id: '${rule.matchId}' match title: '${rule.matchTitle}'`});
	var node = new_element('div', {
		class: 'rule'
		// }, [ruleUp, ruleDown, matchLabel, matchRule, testUrl, testUrlLabel, testTitle, testTitleLabel, idLabel, matchId, edit, save, cancel, del]);
	}, [arrowdiv, wrap]);

	anchor.appendChild(node);

}

async function updateRules() {
	const anchor = document.getElementById('tab-catch-rules');
	while (anchor.firstChild) {
		anchor.removeChild(anchor.firstChild);
	}

	if (rules.length == 0) {
		return;
	}
	let config = await browser.storage.local.get();
	let regexMode = config.regex_over_wildcard;
	await groups.init();
	for (let i = 0; i < rules.length; i++) {
		makeRuleNode(i, regexMode);
	}
}

async function initRules() {
	await browser.storage.local.get().then(async function (v) {
		if (v.rules != undefined) {
			rules = v.rules;

			await updateRules();
		}
	});
}

async function insertShortcutOptions() {
	const commands = await browser.commands.getAll();
	const anchor = document.getElementById('shortcuts');

	const commandNames = {
		'cycle-next-group': 'Switch to next group'
		, 'cycle-previous-group': 'Switch to previous group'
		, 'open-panorama': 'Toggle groups view'
		, _execute_browser_action: 'Toggle popup panel'
	}

	for (var i in commands) {
		const cmd = commands[i];

		const title = new_element('span', {
			class: 'floatleft'
			// , content: cmd.name
			, content: commandNames[cmd.name]
		});
		const input = new_element('input', {
			type: 'text'
			, class: 'floatright'
			, value: cmd.shortcut == null ? '' : cmd.shortcut
		});

		const node = new_element('div', {
			class: 'shortcut_node'
		}, [title, input]);

		input.addEventListener('blur', function () {
			try {
				if (input.value == null || input.value == '') {
					browser.commands.reset(cmd.name);
				}
				else {
					browser.commands.update({
						name: cmd.name
						, shortcut: input.value
					});
				}
			}
			catch (e) {
				console.log('Invalid input string');
			}
		});

		anchor.appendChild(node);
	}
}

async function saveBackup() {
	var data = {
		file: {
			type: 'panoramaView'
			, version: 1
		}
		, windows: []
	};

	const windows = await browser.windows.getAll({});

	for (const wi in windows) {

		const groups = await browser.sessions.getWindowValue(windows[wi].id, 'groups');
		const groupIndex = await browser.sessions.getWindowValue(windows[wi].id, 'groupIndex');
		const activeGroup = await browser.sessions.getWindowValue(windows[wi].id, 'activeGroup');

		data.windows[wi] = {
			groups: []
			, tabs: []
			, activeGroup: activeGroup
			, groupIndex: groupIndex
		};

		for (const gi in groups) {
			data.windows[wi].groups.push({
				id: groups[gi].id
				, name: groups[gi].name
				, rect: groups[gi].rect
			, });
		}

		const tabs = browser.tabs.query({
			windowId: windows[wi].id
		});
		for (const tab of await tabs) {

			var groupId = await browser.sessions.getTabValue(tab.id, 'groupId');

			if (groupId != -1) {
				data.windows[wi].tabs.push({
					url: tab.url
					, title: tab.title
					, favIconUrl: tab.favIconUrl
					, groupId: groupId
					, index: tab.index
					, lastAccessed: tab.lastAccessed
					, pinned: tab.pinned
				, });
			}
		}
	}

	var blob = new Blob([JSON.stringify(data, null, '\t')], {
		type: 'application/json'
	});
	var dataUrl = window.URL.createObjectURL(blob);

	var filename = 'panoramaView-backup-' + makeDateString() + '.json';

	await browser.downloads.download({
		url: dataUrl
		, filename: filename
		, conflictAction: 'uniquify'
		, saveAs: true
	});
}

async function initCheckboxWithId(pElementId, pControllingSetting, pCallback) {
	initInputOptionWithId(pElementId, 'click', 'checked', false, pControllingSetting, pCallback);
}

async function initInputOptionWithId(pElementId, pEvent, pValueKey, pDefaultValue, pControllingSetting, pCallback) {
	let field = document.getElementById(pElementId);

	browser.storage.local.get().then(v => {
		field[pValueKey] = v[pControllingSetting] || pDefaultValue;
	});

	field.addEventListener(pEvent, e => {
		e.stopPropagation();
		let o = {};
		o[pControllingSetting] = field[pValueKey];
		browser.storage.local.set(o);

		if (pCallback != null) {
			pCallback(field[pValueKey]);
		}
	}, false);
}

function init() {
	//document.getElementById('backupFileInput').addEventListener('change', loadBackup);
	// document.getElementById('saveBackupButton').addEventListener('click', saveBackup);
	insertShortcutOptions();

	initCheckboxWithId('tst', 'use_tst_indent');
	initCheckboxWithId('tst_context', 'use_tst_context');
	initCheckboxWithId('tst_tree_close', 'use_tst_tree_close');
	initCheckboxWithId('ftt', 'ftt');
	// initCheckboxWithId('tst_move', 'use_tst_move');
	initCheckboxWithId('numKey', 'use_panel_numkey');
	// initCheckboxWithId('multisel_api', 'multiselect_api_enabled');

	initCheckboxWithId('regex_over_wildcard', 'regex_over_wildcard', updateRules);

	initInputOptionWithId('panorama_css', 'blur', 'value', '', 'panorama_css');
	initInputOptionWithId('popup_css', 'blur', 'value', '', 'popup_css');
	initCheckboxWithId('light_theme', 'light_theme');

	document.getElementById('add-catch-rule').addEventListener('click', function () {
		newRule("");
	});
	// insertGroupInfo();
	initRules();

	document.getElementById('run-tab-catch').addEventListener('click', async function () {
		await updateCatchRules();

		await tabs.forEach(function (tab) {
			tabCatch(tab, function (tabId, groupId) {
				tabs.setGroupId(tabId, groupId);
			});
		})

		tabs.toggleAll();
	});
}

document.addEventListener('DOMContentLoaded', init);