var panoramaTabs = [];
var panoramaViewUrl;

async function registerView(view) {
	return new Promise(function (res, rej) {
		async function attemptResolve() {
			if (TABINTERFACE == null) {
				QUEUE.do(null, attemptResolve);
				return;
			}

			let previousView = panoramaTabs[view.windowId];
			panoramaTabs[view.windowId] = view;
			await TABINTERFACE.setGroupId(view.tabId, -1);

			try {
				if (previousView != null && previousView.tabId != view.tabId) {
					browser.tabs.remove(previousView.tabId);
				}
			}
			catch (e) {
				console.log(e);
			}

			res(TABINTERFACE);
		}

		var count = 0;
		while (QUEUE == null) {
			count++;
			if (count > 20) return;
		}

		QUEUE.do(null, attemptResolve);
	});
}

function registerPopup() {
	return new Promise(function (res, rej) {
		async function attemptResolve() {
			if (TABINTERFACE == null) {
				QUEUE.do(null, attemptResolve);
				return;
			}
			res(TABINTERFACE);
		}

		var count = 0;
		while (QUEUE == null) {
			count++;
			if (count > 20) return;
		}

		QUEUE.do(null, attemptResolve);
	});
}

async function openView() {
	let windowId = (await browser.windows.getCurrent()).id;
	let view = panoramaTabs[windowId];

	if (view == null) {
		browser.tabs.create({
			url: "/view.html"
			, active: true
		});

		return;
	}

	var tab = (await browser.tabs.query({
		active: true
		, currentWindow: true
	}))[0];

	if (tab.id == view.tabId) {
		let tabs = await browser.tabs.query({
			windowId: tab.windowId
		});

		tabs = tabs.sort(function (a, b) {
			return b.lastAccessed - a.lastAccessed;
		});

		var i = 0;
		let n = tabs.length;
		while (i < n) {
			tab = tabs[i++];
			if (tab.url != panoramaViewUrl) {
				browser.tabs.update(tab.id, {
					active: true
				});
				break;
			}
		}
		return;
	}

	try {
		browser.tabs.update(view.tabId, {
			active: true
		});
	}
	catch (e) {
		browser.tabs.create({
			url: "/view.html"
			, active: true
		});
	}
}