const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const BASE_VISUALIZATION_PATH = path.join(__dirname, "../analytics/visualizations");
const SERVER_BASE_URL = "https://your-server-name.onrender.com"; // Change this when deploying!
const LOCAL_BASE_URL = "http://127.0.0.1:3000"

// Helper to format DD/MM/YYYY → folder name
function findMatchingFolder(basePath, dateStr) {
	const [day, month, year] = dateStr.split("/").map(Number);
	if (!day || !month || !year) return null;

	const datePart = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

	const allFolders = fs.readdirSync(basePath);
	const matchedFolder = allFolders.find((folder) => folder.startsWith(datePart));

	return matchedFolder || null;
}


router.get("/", async (req, res) => {
	try {
		const { date, type = "both", crop } = req.query;

		if (!date) {
			return res.status(400).json({ success: false, message: "Missing required parameter: date (dd/mm/yyyy)" });
		}

		const folderName = findMatchingFolder(BASE_VISUALIZATION_PATH, date);;
		if (!folderName) {
			return res.status(400).json({ success: false, message: "Invalid date format. Expected dd/mm/yyyy" });
		}

		const targetPath = path.join(BASE_VISUALIZATION_PATH, folderName);

		if (!fs.existsSync(targetPath)) {
			return res.status(404).json({ success: false, message: "No visualizations found for given date." });
		}

		// Choose subfolders
		const typesToCheck = [];
		if (type === "both") {
			typesToCheck.push("crop-conditions", "k-values");
		} else if (type === "crop-conditions" || type === "k-values") {
			typesToCheck.push(type);
		} else {
			return res.status(400).json({ success: false, message: "Invalid type. Must be 'crop-conditions', 'k-values', or 'both'" });
		}

		const visualizationLinks = [];

		for (const visType of typesToCheck) {
			const typeFolder = path.join(targetPath, visType);

			if (!fs.existsSync(typeFolder)) continue;

			const files = fs.readdirSync(typeFolder);

			const filteredFiles = crop ? files.filter((file) => file.toLowerCase().includes(crop.toLowerCase())) : files;

			filteredFiles.forEach((file) => {
				const urlPath = `/analytics/visualizations/${folderName}/${visType}/${file}`;
				visualizationLinks.push(`${process.env.NODE_ENV === "production" ? SERVER_BASE_URL : LOCAL_BASE_URL}${urlPath}`);
			});
		}

		return res.status(200).json({
			success: true,
			count: visualizationLinks.length,
			visualizations: visualizationLinks,
		});
	} catch (error) {
		console.error("Error fetching visualizations:", error);
		return res.status(500).json({ success: false, message: "Server error." });
	}
});

module.exports = router;
