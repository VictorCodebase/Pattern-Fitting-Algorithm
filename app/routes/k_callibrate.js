/**
 * API endpoint for crop calibration
 * Handles the generation of the crops_k_calibrated.json file
 */
const express = require("express");
const { calibrateCrops } = require("../utils/crop-calibration-handler");
const router = express.Router();

/**
 * POST /api/calibrate-crops
 * Generates calibrated crop data from client-provided crop information
 *
 * Expected request body:
 * {
 *   crops: {
 *     "Crop Name": {
 *       "variety": "Variety Name",
 *       "region": "Region",
 *       "coordinates": [lat, lng],
 *       "planting_season_month": 4,
 *       "duration_days": 90
 *     },
 *     ...
 *   },
 *   config: {
 *     // Optional configuration overrides
 *     BASE_IMPORTANCE: {
 *       "temperature_2m_max": 5.0,
 *       ...
 *     },
 *     ...
 *   }
 * }
 */
router.post("/calibrate-crops", async (req, res) => {
	try {
		const { crops, config } = req.body;

		// Validate request
		if (!crops || Object.keys(crops).length === 0) {
			return res.status(400).json({
				success: false,
				error: "No crop data provided",
			});
		}

		// Run calibration process
		const result = await calibrateCrops(crops, config);

		// Return results
		res.json(result);
	} catch (error) {
		console.error("Error in crop calibration endpoint:", error);
		res.status(500).json({
			success: false,
			error: error.message,
			stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
		});
	}
});

module.exports = router;
