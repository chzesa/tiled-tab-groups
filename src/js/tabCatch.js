let tab_catch_rules = [];
var webNavigationListener = false;

async function onWebNavigation(nav) {
	let tab;
	try {
		tab = await browser.tabs.get(nav.tabId);
		tabCatch(tab);
	}
	catch (e) {}
}

async function updateCatchRules(windowId) {
	let rules;
	let regexMode;

	await browser.storage.local.get().then(function (v) {
		regexMode = v.regex_over_wildcard;
	});

	rules = (await browser.sessions.getWindowValue(windowId, 'rules')) || [];
	let newRules = [];

	for (let i = 0; i < rules.length; i++) {
		let rule = rules[i];

		// Ignore any regex rules if current matching mode
		// is set to match wildcards.
		if (!regexMode && rule.lastEdit == 1) {
			continue;
		}

		if (!rule.matchUrl && !rule.matchTitle) {
			continue;
		}

		if (rule.regex == "") {
			continue;
		}

		let o = {};
		o.regex = new RegExp(rule.regex, 'i');
		o.matchUrl = rule.matchUrl;
		o.matchTitle = rule.matchTitle;
		o.targetId = rule.targetId;

		newRules.push(o);
	}

	if (newRules.length > 0 && !webNavigationListener) {
		browser.webNavigation.onCompleted.addListener(onWebNavigation);
		webNavigationListener = true;
	}

	tab_catch_rules[windowId] = newRules;

	let disable = true;

	for (let array in tab_catch_rules) {
		if (array.length > 0) {
			disable = false;
			break;
		}
	}

	if (disable && webNavigationListener) {
		browser.webNavigation.onCompleted.removeListener(onWebNavigation);
		webNavigationListener = false;
	}
}

async function tabCatch(tab) {
	let rules = tab_catch_rules[tab.windowId] || [];

	for (let i = 0; i < rules.length; i++) {
		let rule = rules[i];
		let rx = rule.regex;

		if (rule.matchUrl && !rx.test(tab.url)) {
			continue;
		}

		if (rule.matchTitle && !rx.test(tab.title)) {
			continue;
		}

		let group = TABINTERFACE.getGroup(tab.windowId, rule.targetId);

		if (group == null) {
			console.log(`Attempted to target a non-existent group with rule in window ${windowId}`);
			continue;
		}

		QUEUE.do(async function () {
			await TABINTERFACE.setGroupId(tab.id, group.id);
			let view = panoramaTabs[tab.windowId];
			if (view != null) {
				await view.reorderGroup(group.id);
			}
		});

		break;
	}
}