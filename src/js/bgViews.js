var openingView = false;
var panoramaTabs = [];
var panoramaViewUrl;

async function getViewId(windowId) {
	const tabs = await browser.tabs.query({
		url: browser.extension.getURL("view.html")
		, windowId
	});

	return tabs.length ? tabs[0].id : undefined;
}

async function openView() {
	let tabs = await browser.tabs.query({
		active: true
		, currentWindow: true
	});

	var tab = tabs[0];

	const viewId = await getViewId(tab.windowId);

	if (tab.id == viewId) {
		tabs = await browser.tabs.query({
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

	if (viewId) {
		browser.tabs.update(viewId, {
			active: true
		});
	}
	else {
		openingView = true;
		browser.tabs.create({
			url: "/view.html"
			, active: true
		});
	}
}