async function wait(dur) {
	return new Promise(function (res) {
		setTimeout(res, dur);
	});
}