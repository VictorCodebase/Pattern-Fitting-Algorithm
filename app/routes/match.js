// Example API endpoint implementation
const express = require("express");
// const path = require("path");
// const fs = require("fs");
const { runCropMatching } = require("../utils/crop-matching");
const { loadJson } = require("../utils/load-crops");

const router = express.Router();

// sample request:
// http://url/run-matching

// {
// "forecast": [
//     	{
// 		"date": "2020-01-01T00:00:00.000Z",
// 		"soil_moisture_0_to_10cm_mean": 0.3813998997,
// 		"temperature_2m_max": 3.7307720184,
// 		"temperature_2m_min": -2.4420838356,
// 		"wind_speed_10m_mean": 14.8303375244,
// 		"relative_humidity_2m_mean": 90.4863967896,
// 		"precipitation_sum": 7.9834833145
// 	},
// 	{
// 		"date": "2020-01-02T00:00:00.000Z",
// 		"soil_moisture_0_to_10cm_mean": 0.3980634511,
// 		"temperature_2m_max": 8.780919075,
// 		"temperature_2m_min": 1.8988697529,
// 		"wind_speed_10m_mean": 21.8881320953,
// 		"relative_humidity_2m_mean": 86.4485778809,
// 		"precipitation_sum": 7.1970887184
// 	}
// ],
// "config":{
// 	"STEP_SIZE": 30,
// 	"MAX_NAN_RATIO": 0.15,
// 	"DEFAULT_K": 2.0,
// 	"REQUIRED_FIELDS": [
// 		"soil_moisture_0_to_10cm_mean",
// 		"temperature_2m_max",
// 		"temperature_2m_min",
// 		"wind_speed_10m_mean",
// 		"relative_humidity_2m_mean",
// 		"precipitation_sum"
// 	]
// }
// }

/**
 * POST /api/crop-matching
 * Runs the crop matching algorithm with provided data and config
 */
router.post("/", async (req, res) => {
	try {
		const { forecast, config = {} } = req.body;

		// Load crops data
		const cropsData = loadJson("crops_k_calibrated")

		// Run crop matching algorithm
		const result = await runCropMatching(cropsData, forecast, config);

		// Return results and logs
		res.json({
			success: true,
			results: result.results,
			logs: result.logs,
		});
	} catch (error) {
		console.error("Error in crop matching endpoint:", error);
		res.status(500).json({
			success: false,
			error: error.message,
			stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
		});
	}
});

module.exports = router;
