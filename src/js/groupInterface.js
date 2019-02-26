async function groupInterface(windowId) {
	const self = {};
	var groups;
	var array = [];
	var nextIndex;

	try {
		nextIndex = await browser.sessions.getWindowValue(windowId, 'groupIndex') || 0;
		let temp = await browser.sessions.getWindowValue(windowId, 'groups');
		groups = {};
		if (temp != null) {
			for (var i = 0; i < temp.length; i++) {
				let grp = temp[i];
				grp.index = i;
				groups[grp.id] = grp;
				array.push(grp);
			}
		}

		if (groups == null) {
			groups = {};
			await self.new();
		}

		for (var key in groups) {
			var group = groups[key];
			group.windowId = windowId;
			group.tabCount = 0;
		}
	}
	catch (e) {
		return null;
	}

	self.save = async function () {
		try {
			await browser.sessions.setWindowValue(windowId, 'groups', array);
		}
		catch (e) {
			console.log(e);
		}
	}

	self.new = async function () {
		let id = nextIndex++;
		try {
			await browser.sessions.setWindowValue(windowId, 'groupIndex', nextIndex);
		}
		catch (e) {
			console.log(e);
			return;
		}

		let group = {
			id
			, name: `Group ${id}`
			, windowId
			, containerId: 'firefox-default'
			, tabCount: 0
			, stash: false
			, index: array.length
		};

		groups[id] = group;
		array.push(group);

		await self.save();

		return group;
	}

	self.setStash = async function (id, state) {
		let group = groups[id];
		if (group != null && state != null && group.stash != state) {
			groups[id].stash = state;
			await self.save();
		}
	}

	self.remove = async function (id) {
		let group = groups[id];
		if (group != null && id != -1) {
			let removedGroup = array.splice(group.index, 1)[0];

			if (group.id != removedGroup.id) {
				throw new Error(`Mismatch in group array and map`);
			}

			delete groups[id];
			let n = array.length;
			for (var i = group.index; i < n; i++) {
				array[i].index = i;
			}

			await self.save();
		}
	}

	self.rename = async function (id, newName) {
		let group = groups[id];

		if (group != null && newName != null) {
			group.name = newName;

			await this.save();
		}
	}

	self.get = function (id) {
		return groups[id];
	}

	self.getByIndex = function (index, offset = 0) {
		index += array.length + offset % array.length;

		return array[index % array.length];
	}

	self.forEach = async function (callback) {
		let promises = [];
		let n = array.length;
		for (var i = 0; i < n; i++) {
			promises.push(callback(array[i]));
		}

		await Promise.all(promises);
	}

	return self;
}