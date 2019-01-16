function isVersionOlderThan(a, comp) {
	let r = /(\d+)\.(\d+)\.(\d+)/;
	let va = r.exec(a);
	let vcomp = r.exec(comp);

	for (let i = 1; i < 4; i++) {
		if (va[i] < vcomp[i]) {
			return true;
		}
	}

	return false;
}

async function migrateSettings() {
	let config = await browser.storage.local.get();
	let manifest = browser.runtime.getManifest();

	if (config.version == null) {
		config.firstInstall = manifest.version;
		config.version = manifest.version;
	}

	if (config.firstInstall == "0.13.8") {
		config.salvage_debug_info = null;

		for (rule in config.rules) {
			rule.matchUrl = true;
		}
	}

	if (isVersionOlderThan(config.version, "0.15.0")) {
		if (config.rules == null) {
			config.rules = [];
		}

		if (config.rules.length == 0) {
			config.regex_over_wildcard = false;
			config.regex_nextId = 0;
		}
		else {
			config.regex_over_wildcard = true;
			config.regex_nextId = config.rules.length;

			for (let i = 0; i < config.rules.length; i++) {
				config.rules[i].id = i;
				config.rules[i].lastEdit = 1;
			}
		}
	}

	// Make light theme default
	if (!isVersionOlderThan(config.firstInstall, manifest.version)) {
		if (config.light_theme === undefined) {
			config.light_theme = true;
		}
	}

	config.version = manifest.version;
	await browser.storage.local.set(config);
}