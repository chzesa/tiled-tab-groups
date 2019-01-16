let tab_catch_rules = [];

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
}

async function tabCatchNav(nav, callback) {
	browser.tabs.get(nav.tabId).then(function (tab) {
		tabCatch(tab, callback);
	});
}

async function tabCatch(tab, callback) {
	for (let i = 0; i < tab_catch_rules.length; i++) {
		let rule = tab_catch_rules[i];
		let rx = rule.regex;

		if (rule.matchUrl && !rx.test(tab.url)) {
			continue;
		}

		if (rule.matchTitle && !rx.test(tab.title)) {
			continue;
		}

		let group = groups.get(rule.targetId);

		if (group == undefined) {
			break;
		}

		if (tab.windowId == group.windowId) {
			if (callback != null) {
				callback(tab.id, group.id);
			}
		}
		break;
	}
}