/**
 * Crop Calibration Handler
 * Handles the generation of the crops_k_calibrated.json file
 */
const path = require("path");
const fs = require("fs");
const { fetchCropWeatherData } = require("../services/weather-service");
const { computeCropKValues } = require("./k-calibration")
const { generateVisualization } = require("../services/visualization-service");

// Default configuration
const DEFAULT_CONFIG = {
	BASE_IMPORTANCE: {
		temperature_2m_max: 5.0, // High importance - critical growth factor
		temperature_2m_min: 4.5, // High importance - frost/cold risk
		soil_moisture_0_to_10cm_mean: 4.0, // High importance - directly affects roots
		precipitation_sum: 3.0, // Medium importance - can be mitigated by irrigation
		relative_humidity_2m_mean: 2.5, // Medium importance - affects disease pressure
		wind_speed_10m_mean: 1.5, // Lower importance - secondary effect
	},
	VISUALIZATION_PATH: path.join(__dirname, "../analytics/visualizations"),
	WEATHER_PARAMS: {
		models: "MRI_AGCM3_2_S",
		daily: ["soil_moisture_0_to_10cm_mean", "temperature_2m_max", "temperature_2m_min", "wind_speed_10m_mean", "relative_humidity_2m_mean"],
		daily_2: "precipitation_sum",
		timezone: "auto",
	},
};

/**
 * Process crop data, fetch weather data, compute K values, generate visualizations, and save the result
 * @param {Object} cropsData - The initial crops data from the client
 * @param {Object} config - Optional configuration overrides
 * @returns {Object} - Processing results and calibrated crop data
 */
async function calibrateCrops(cropsData, config = {}) {
	// Merge config with defaults
	const mergedConfig = {
		...DEFAULT_CONFIG,
		...config,
		BASE_IMPORTANCE: {
			...DEFAULT_CONFIG.BASE_IMPORTANCE,
			...(config.BASE_IMPORTANCE || {}),
		},
		WEATHER_PARAMS: {
			...DEFAULT_CONFIG.WEATHER_PARAMS,
			...(config.WEATHER_PARAMS || {}),
		},
	};

	// Initialize logs
	const logs = {
		timestamp: new Date().toISOString(),
		crop_count: Object.keys(cropsData).length,
		crops_processed: [],
		errors: [],
		visualizations: [],
		k_calibration: {
			logs: [],
		},
	};

	try {
		// Create visualization directory if it doesn't exist
		const visualizationPath = mergedConfig.VISUALIZATION_PATH;
		const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
		const visualDir = path.join(visualizationPath, timestamp);

		if (!fs.existsSync(visualDir)) {
			fs.mkdirSync(visualDir, { recursive: true });
		}

		// Calculate planting dates for each crop
		for (const crop in cropsData) {
			const data = cropsData[crop];
			const midMonth = data.planting_season_month;
			const midDate = new Date(2017, midMonth - 1, 15); // Month is 0-indexed in JS

			// Calculate start and end dates
			const startDate = new Date(midDate);
			startDate.setDate(startDate.getDate() - Math.floor(data.duration_days / 2));

			const endDate = new Date(startDate);
			endDate.setDate(endDate.getDate() + data.duration_days);

			// Update crop with date ranges
			cropsData[crop].start_date = startDate.toISOString().split("T")[0];
			cropsData[crop].end_date = endDate.toISOString().split("T")[0];
		}

		// Fetch weather data for each crop
		logs.status = "Fetching weather data";
		cropsData = await fetchCropWeatherData(cropsData, mergedConfig.WEATHER_PARAMS, logs);

		// Generate visualizations for crop conditions
		logs.status = "Generating crop visualizations";
		const cropVisualizations = await generateVisualization(cropsData, visualDir, "crop-conditions", logs);
		logs.visualizations.push(...cropVisualizations);

		// Compute K values for each crop
		logs.status = "Computing K values";
		const result = computeCropKValues(cropsData, mergedConfig.BASE_IMPORTANCE, logs);
		cropsData = result.crops;
		logs.k_calibration.logs = result.logs;

		// Generate visualizations for K values
		logs.status = "Generating K value visualizations";
		const kVisualizations = await generateVisualization(cropsData, visualDir, "k-values", logs);
		logs.visualizations.push(...kVisualizations);

		// Save calibrated crops to file
		const outputPath = path.join(__dirname, "../crops_k_calibrated.json");
		fs.writeFileSync(outputPath, JSON.stringify(cropsData, null, 2));
		logs.output_file = outputPath;
		logs.status = "Complete";

		return {
			success: true,
			calibrated_crops: cropsData,
			logs,
		};
	} catch (error) {
		logs.status = "Failed";
		logs.errors.push({
			message: error.message,
			stack: error.stack,
		});

		console.error("Crop calibration failed:", error);
		return {
			success: false,
			error: error.message,
			logs,
		};
	}
}

module.exports = { calibrateCrops };
