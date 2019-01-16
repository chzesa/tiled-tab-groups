function newCommandQueue(e = true) {
	let self = {};
	let queue = [];
	let executing = false;
	let onCompleteCallbacks = [];
	let promises = [];
	let enabled = e;

	let wait = async function () {
		if (promises.length > 0) {
			await Promise.all(promises);
			promises = [];
		}
	}

	let execute = async function (redo = false) {
		if (!enabled || (executing && !redo)) {
			return;
		}
		executing = true;
		let cursor = 0;

		while (cursor < queue.length) {
			let o = queue[cursor];

			if (!o.as) {
				await wait();
			}

			try {
				if (o.aw) promises.push(o.cb(o.a));
				else o.cb(o.a);
			}
			catch (e) {
				console.log(e);
			}

			cursor += 1;
		}

		queue.splice(0, cursor);

		await wait();
		for (let i in onCompleteCallbacks) {
			await onCompleteCallbacks[i]();
		}

		if (queue.length > 0) {
			execute(true);
		}
		else {
			executing = false
		}
	}

	self.do = async function (args, callback, allowAsync = false, mustAwait = true) {
		let o = {
			a: args
			, cb: callback
			, as: allowAsync
			, aw: mustAwait
		};

		queue.push(o);

		execute();
	}

	self.onComplete = function (callback) {
		onCompleteCallbacks.push(callback);
	}

	self.disable = async function () {
		enabled = false;

		var i = Math.pow(10, 9);
		while (executing) {
			if (i-- < 0) {
				break;
			}
		}
	}

	self.enable = function () {
		enabled = true;
		execute();
	}

	return self;
}