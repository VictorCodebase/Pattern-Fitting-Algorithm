/**
 * K-value calibration module
 * Computes optimal k values for each weather variable for each crop
 */

/**
 * Calculate the range of values for a given array
 * @param {Array} values - Array of numeric values
 * @returns {number} - Range (max - min)
 */
function calculateRange(values) {
	if (!values || values.length === 0) return 1.0;

	// Filter out null/undefined/NaN values
	const validValues = values.filter((v) => v !== null && v !== undefined && !isNaN(v));

	if (validValues.length === 0) return 1.0;

	const min = Math.min(...validValues);
	const max = Math.max(...validValues);

	// Avoid division by zero
	return max - min || 1.0;
}

/**
 * Compute k values for each crop based on weather data characteristics
 * @param {Object} crops - Crop data object with daily weather
 * @param {Object} baseImportance - Base importance values for each variable
 * @param {Object} logs - Logs object for tracking
 * @returns {Object} - Updated crops with k_values and logs
 */
function computeCropKValues(crops, baseImportance, logs) {
	const calibrationLogs = [];
	const updatedCrops = { ...crops };

	for (const cropName in updatedCrops) {
		const crop = updatedCrops[cropName];

		// Skip if no daily weather data
		if (!crop.daily_weather || crop.daily_weather.length === 0) {
			logs.errors.push({
				crop: cropName,
				message: "Missing daily weather data for K-value calibration",
			});
			continue;
		}

		const kDict = {};
		const ranges = {};

		// Calculate ranges for each variable
		for (const variable in baseImportance) {
			if (crop.daily_weather.some((day) => variable in day)) {
				// Extract values for this variable
				const values = crop.daily_weather.map((day) => day[variable]);
				ranges[variable] = calculateRange(values);
			}
		}

		// Normalize ranges to 0-1 scale
		const maxRange = Math.max(...Object.values(ranges), 1.0);

		for (const variable in ranges) {
			ranges[variable] = ranges[variable] / maxRange;
		}

		// Calculate k values based on importance and data variability
		for (const variable in baseImportance) {
			if (crop.daily_weather.some((day) => variable in day) && variable in ranges) {
				// Variables with high importance AND low natural variation get highest k values
				const variationFactor = Math.max(0.1, 1.0 - 0.5 * ranges[variable]);
				kDict[variable] = baseImportance[variable] * variationFactor;

				// Log the calibration details
				calibrationLogs.push({
					crop: cropName,
					variable: variable,
					range: ranges[variable],
					importance: baseImportance[variable],
					variation_factor: variationFactor,
					k_value: kDict[variable],
				});
			} else {
				kDict[variable] = baseImportance[variable] || null;

				calibrationLogs.push({
					crop: cropName,
					variable: variable,
					range: null,
					importance: baseImportance[variable],
					variation_factor: null,
					k_value: kDict[variable],
					note: "Variable missing in data",
				});
			}
		}

		// Update crop with k values
		updatedCrops[cropName].k_values = kDict;
	}

	return {
		crops: updatedCrops,
		logs: calibrationLogs,
	};
}

module.exports = { computeCropKValues };
