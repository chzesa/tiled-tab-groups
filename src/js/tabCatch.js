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

async function updateCatchRules() {
	let rules;
	let regexMode;

	await browser.storage.local.get().then(function (v) {
		rules = v.rules || [];
		regexMode = v.regex_over_wildcard;
	});

	tab_catch_rules = [];

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
		o.regex = new RegExp(rule.regex, 'i')
		o.matchUrl = rule.matchUrl;
		o.matchTitle = rule.matchTitle;
		o.targetId = rule.targetId;

		tab_catch_rules.push(o);
	}

	if (rules.length > 0 && !webNavigationListener) {
		browser.webNavigation.onCompleted.addListener(onWebNavigation);
		webNavigationListener = true;
	}

	if (rules.length == 0 && webNavigationListener) {
		browser.webNavigation.onCompleted.removeListener(onWebNavigation);
		webNavigationListener = false;
	}
}

async function tabCatch(tab) {
	for (let i = 0; i < tab_catch_rules.length; i++) {
		let rule = tab_catch_rules[i];
		let rx = rule.regex;

		if (rule.matchUrl && !rx.test(tab.url)) {
			continue;
		}

		if (rule.matchTitle && !rx.test(tab.title)) {
			continue;
		}

		let group = TABINTERFACE.getGroup(tab.windowId, rule.targetId);

		if (group == null) {
			break;
		}

		if (tab.windowId == group.windowId) {
			QUEUE.do(null, async function () {
				await TABINTERFACE.setGroupId(tab.id, group.id);
				let view = panoramaTabs[tab.windowId];
				if (view != null) {
					await view.reorderGroup(group.id);
				}
			});
		}
		break;
	}
}