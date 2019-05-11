function wildcardToRegex(str) {
	const regexSpecialCharacters = /'\[|\]|\(|\)|\{|\}|\\|\.|\^|\$|\+|\?|\|'/;
	let ret = "";

	for (var i = 0; i < str.length; i++) {
		var c = str.charAt(i);
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
var TABINTERFACE;
var bgPage;
var WINDOW_ID;
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
	await updateRules();
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

	await browser.sessions.setWindowValue(WINDOW_ID, 'rules', rules);
	bgPage.enqueueTask(bgPage.updateCatchRules, WINDOW_ID);
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

	await TABINTERFACE.getGroupInterface(WINDOW_ID).forEach(function (group) {
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

	var node = new_element('div', {
		class: 'rule'
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

	for (let i = 0; i < rules.length; i++) {
		makeRuleNode(i, regexMode);
	}
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

async function init() {
	bgPage = browser.extension.getBackgroundPage();
	TABINTERFACE = await bgPage.registerPopup();
	WINDOW_ID = (await browser.windows.getCurrent()).id;
	//document.getElementById('backupFileInput').addEventListener('change', loadBackup);
	// document.getElementById('saveBackupButton').addEventListener('click', saveBackup);
	insertShortcutOptions();

	initCheckboxWithId('tst', 'use_tst_indent');
	initCheckboxWithId('tst_tree_close', 'use_tst_tree_close');
	initCheckboxWithId('ftt', 'ftt');
	// initCheckboxWithId('tst_move', 'use_tst_move');
	initCheckboxWithId('numKey', 'use_panel_numkey');

	initCheckboxWithId('regex_over_wildcard', 'regex_over_wildcard', updateRules);

	initInputOptionWithId('panorama_css', 'blur', 'value', '', 'panorama_css');
	initInputOptionWithId('popup_css', 'blur', 'value', '', 'popup_css');
	initCheckboxWithId('light_theme', 'light_theme');

	document.getElementById('add-catch-rule').addEventListener('click', function () {
		newRule("");
	});

	rules = (await browser.sessions.getWindowValue(WINDOW_ID, 'rules')) || [];
	await updateRules();

	document.getElementById('run-tab-catch').addEventListener('click', function () {
		bgPage.enqueueTask(async function () {
			await bgPage.updateCatchRules(WINDOW_ID);
			await TABINTERFACE.forEach(bgPage.tabCatch);
		});
	});
}

document.addEventListener('DOMContentLoaded', init);