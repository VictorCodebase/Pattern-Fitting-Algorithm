const fs = require("fs");
const path = require("path");

function loadJson(file_name) {
	const filePath = path.resolve(`app/${file_name}.json`);
	const rawData = fs.readFileSync(filePath);
	return JSON.parse(rawData);
}

module.exports = { loadJson };
