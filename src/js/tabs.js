var tabs = tabs || {};

tabs.setGroupId = async function (tabId, groupId) {
	await browser.sessions.setTabValue(tabId, 'groupId', groupId);
};

tabs.setGroupIdUpdate = async function (tabId, groupId) {
	await browser.sessions.setTabValue(tabId, 'groupId', groupId);
	await tabs.toggleAll();
};

tabs.getGroupId = async function (tabId) {
	return browser.sessions.getTabValue(tabId, 'groupId');
};

tabs.forEach = async function (callback) {
	const tabs = browser.tabs.query({
		currentWindow: true
	});

	var promises = [];

	for (const tab of await tabs) {
		promises.push(callback(tab));
	}

	await Promise.all(promises);
};

tabs.toggleAll = async function () {
	var active = await groups.getActive();

	var t = await browser.tabs.query({
		currentWindow: true
	});

	var h = [];
	var s = [];
	var p = [];

	async function f(tab) {
		try {
			let groupId = await tabs.getGroupId(tab.id);
			if (groupId == active)
			s.push(tab.id);
			else
			h.push(tab.id);
		}
		catch (e) {}
	};

	for (var i in t) {
		var tab = t[i];
		p.push(f(tab));
	}

	await Promise.all(p);

	try {
		browser.tabs.hide(h);
		browser.tabs.show(s);
	}
	catch (e) {
		console.log(e);
		tabs.toggleAll();
	}
}