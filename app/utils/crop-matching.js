/**
 * Crop Matching Algorithm
 * Converted from Python to JavaScript
 */

// CONFIG - will be overridden by client if provided
const DEFAULT_CONFIG = {
	STEP_SIZE: 30,
	MAX_NAN_RATIO: 0.15,
	DEFAULT_K: 2.0,
	REQUIRED_FIELDS: [
		"soil_moisture_0_to_10cm_mean",
		"temperature_2m_max",
		"temperature_2m_min",
		"wind_speed_10m_mean",
		"relative_humidity_2m_mean",
		"precipitation_sum",
	],
};

/**
 * Main function to run crop matching algorithm
 * @param {Object} crops - Object with crop data
 * @param {Array} forecastData - Array of daily weather forecast objects
 * @param {Object} config - Optional configuration to override defaults
 * @returns {Object} - Results and logs
 */
function runCropMatching(crops, forecastData, clientConfig = {}) {
	// Merge provided config with defaults
	const CONFIG = { ...DEFAULT_CONFIG, ...clientConfig };

	// Initialize log storage
	const logData = {
		timestamp: new Date().toISOString(),
		config: {
			step_size: CONFIG.STEP_SIZE,
			max_nan_ratio: CONFIG.MAX_NAN_RATIO,
			required_fields: CONFIG.REQUIRED_FIELDS,
		},
		summary: {
			crops_processed: 0,
			crops_disqualified_duration: 0,
			crops_no_valid_windows: 0,
			crops_successful: 0,
			total_windows_processed: 0,
			windows_insufficient_data: 0,
			windows_successful: 0,
		},
		crop_logs: {},
		errors: [],
	};

	// Default variable weights
	const DEFAULT_VARIABLE_WEIGHTS = {};
	CONFIG.REQUIRED_FIELDS.forEach((field) => {
		DEFAULT_VARIABLE_WEIGHTS[field] = 1 / CONFIG.REQUIRED_FIELDS.length;
	});

	/**
	 * Add error to log data
	 * @param {string} message - Error message
	 * @param {string} cropName - Optional crop name
	 * @param {string} windowStart - Optional window start date
	 */
	function logError(message, cropName = null, windowStart = null) {
		const errorEntry = {
			timestamp: new Date().toISOString(),
			message: message,
		};

		if (cropName) errorEntry.crop = cropName;
		if (windowStart) errorEntry.window_start = windowStart;

		logData.errors.push(errorEntry);
		console.error(`ERROR: ${message}`);
	}

	/**
	 * Compute exp(x) safely, avoiding overflow
	 * @param {number|Array} x - Input value(s)
	 * @returns {number|Array} - Computed exp value(s)
	 */
	function safeExp(x) {
		try {
			if (Array.isArray(x)) {
				// Apply to array
				return x.map((val) => {
					const clippedVal = Math.max(-709, Math.min(709, val)); // Prevent overflow
					return Math.exp(clippedVal);
				});
			} else {
				// Apply to single value
				const clippedVal = Math.max(-709, Math.min(709, x));
				return Math.exp(clippedVal);
			}
		} catch (e) {
			logError(`Error in safeExp: ${e.message}`);
			return Array.isArray(x) ? Array(x.length).fill(1) : 1;
		}
	}

	/**
	 * Calculate logistic score with variable-specific k value
	 * @param {Array} relDelta - Relative delta values
	 * @param {number} k - Sensitivity parameter
	 * @returns {Array} - Computed scores
	 */
	function logisticScore(relDelta, k) {
		try {
			const powValues = relDelta.map((d) => Math.pow(d, 0.5));
			const negK = powValues.map((v) => -k * v);
			const expValues = safeExp(negK);
			return expValues.map((e) => 1 / (1 + e));
		} catch (e) {
			logError(`Error in logisticScore: ${e.message}`);
			return Array(relDelta.length).fill(0);
		}
	}

	/**
	 * Linearly decreases score as relDelta increases
	 * @param {Array} relDelta - Relative delta values
	 * @param {number} maxDelta - Maximum delta for scoring
	 * @returns {Array} - Computed scores
	 */
	function linearScore(relDelta, maxDelta = 1.0) {
		return relDelta.map((d) => Math.max(0, Math.min(1, 1 - d / maxDelta)));
	}

	/**
	 * Compute matching score between forecast window and crop historical data
	 * @param {Array} windowData - Forecast window data
	 * @param {Array} cropData - Crop historical data
	 * @param {Object} kValues - k values for each variable
	 * @param {Object} variableWeights - Weights for each variable
	 * @param {string} cropName - Crop name
	 * @param {string} windowStart - Window start date
	 * @returns {Array} - Score and variable details
	 */
	function computeScore(windowData, cropData, kValues, variableWeights, cropName, windowStart) {
		const scores = [];
		let totalWeight = 0;
		const variableDetails = {};

		// Ensure the crop exists in log data
		if (!logData.crop_logs[cropName]) {
			logData.crop_logs[cropName] = {
				windows: {},
				warnings: [],
				k_values_used: kValues,
			};
		}

		// Initialize window in log data
		if (!logData.crop_logs[cropName].windows[windowStart]) {
			logData.crop_logs[cropName].windows[windowStart] = {
				variables: {},
				warnings: [],
			};
		}

		const windowLog = logData.crop_logs[cropName].windows[windowStart];

		for (const varName of CONFIG.REQUIRED_FIELDS) {
			// Skip if variable not in data
			if (!windowData.every((day) => varName in day) || !cropData.every((day) => varName in day)) {
				windowLog.warnings.push(`Variable '${varName}' not found in data`);
				continue;
			}

			// Extract values from both datasets
			const forecastVals = windowData.map((day) => day[varName]);
			const optimalVals = cropData.map((day) => day[varName]);

			// Track NaN counts
			const nanForecast = forecastVals.filter((val) => val === null || isNaN(val)).length;
			const nanOptimal = optimalVals.filter((val) => val === null || isNaN(val)).length;

			// Create valid data pairs (where neither value is NaN)
			const validPairs = [];
			for (let i = 0; i < forecastVals.length; i++) {
				if (forecastVals[i] !== null && !isNaN(forecastVals[i]) && optimalVals[i] !== null && !isNaN(optimalVals[i])) {
					validPairs.push({
						forecast: forecastVals[i],
						optimal: optimalVals[i],
					});
				}
			}

			const validCount = validPairs.length;

			// Skip if no valid data points for this variable
			if (validCount === 0) {
				windowLog.warnings.push(`No valid data points for variable '${varName}'`);
				continue;
			}

			// Get k value for this variable and crop
			const k = kValues[varName] || CONFIG.DEFAULT_K;
			const weight = variableWeights[varName] || 1 / CONFIG.REQUIRED_FIELDS.length;

			try {
				// Calculate relative deltas
				const relDeltas = validPairs.map((pair) => Math.abs(pair.forecast - pair.optimal) / (Math.abs(pair.optimal) + 1e-5));

				// Calculate scores
				const dailyScores = logisticScore(relDeltas, k);
				const variableScore = dailyScores.reduce((sum, score) => sum + score, 0) / dailyScores.length;

				const weightedScore = variableScore * weight;
				scores.push(weightedScore);
				totalWeight += weight;

				// Store variable details
				windowLog.variables[varName] = {
					k_value: k,
					weight: weight,
					valid_points: validCount,
					nan_forecast: nanForecast,
					nan_optimal: nanOptimal,
					avg_rel_delta: relDeltas.reduce((sum, delta) => sum + delta, 0) / relDeltas.length,
					score: variableScore,
					weighted_score: weightedScore,
				};
			} catch (e) {
				const errorMsg = `Error processing variable '${varName}': ${e.message}`;
				logError(errorMsg, cropName, windowStart);
				windowLog.warnings.push(errorMsg);
			}
		}

		if (scores.length === 0 || totalWeight === 0) {
			windowLog.warnings.push("No valid scores computed");
			return [null, null];
		}

		// Normalize by total weight used (in case some variables were skipped)
		const finalScore = scores.reduce((sum, score) => sum + score, 0) / totalWeight;
		windowLog.final_score = finalScore;

		return [finalScore, windowLog.variables];
	}

	/**
	 * Process crop matching for all crops
	 */
	function processCrops() {
		// Parse dates in forecast data
		const forecastDf = forecastData.map((day) => ({
			...day,
			date: new Date(day.date),
		}));

		// Sort by date to ensure proper sequence
		forecastDf.sort((a, b) => a.date - b.date);

		const results = [];

		// Process each crop
		for (const cropName in crops) {
			const crop = crops[cropName];

			logData.summary.crops_processed += 1;

			try {
				// Parse dates in crop data
				const cropDf = crop.daily_weather.map((day) => ({
					...day,
					date: new Date(day.date),
				}));

				// Sort by date
				cropDf.sort((a, b) => a.date - b.date);

				const duration = cropDf.length;

				// Initialize crop in log data if not exists
				if (!logData.crop_logs[cropName]) {
					logData.crop_logs[cropName] = {
						windows: {},
						warnings: [],
						duration_days: duration,
						region: crop.region || "Unknown",
						variety: crop.variety || "Unknown",
					};
				}

				const cropLog = logData.crop_logs[cropName];

				// Skip if crop duration is longer than forecast period
				if (duration > forecastDf.length) {
					const warning = `Disqualified: duration (${duration}) exceeds forecast length (${forecastDf.length})`;
					cropLog.warnings.push(warning);
					console.warn(`  Warning: ${warning}`);
					logData.summary.crops_disqualified_duration += 1;
					continue;
				}

				// Get crop-specific k values or use defaults
				const kValues = crop.k_values || {};
				if (Object.keys(kValues).length === 0) {
					cropLog.warnings.push("No k_values found, using defaults");
				}

				cropLog.k_values_used = kValues;

				// Calculate variable weights from k values (normalize k values to sum to 1)
				let variableWeights = DEFAULT_VARIABLE_WEIGHTS;

				if (Object.keys(kValues).length > 0) {
					// Filter to only include k values for required fields that exist
					const validKValues = {};
					CONFIG.REQUIRED_FIELDS.forEach((field) => {
						if (field in kValues && kValues[field] !== null) {
							validKValues[field] = kValues[field];
						}
					});

					// Check for missing k values
					CONFIG.REQUIRED_FIELDS.forEach((field) => {
						if (!(field in validKValues)) {
							cropLog.warnings.push(`Missing k value for '${field}', will use default`);
						}
					});

					// Calculate sum of k values for normalization
					const kSum = Object.values(validKValues).reduce((sum, val) => sum + val, 0) || 1;

					// Create normalized weights
					variableWeights = {};
					Object.keys(validKValues).forEach((field) => {
						variableWeights[field] = validKValues[field] / kSum;
					});

					cropLog.normalized_weights = variableWeights;
				} else {
					cropLog.normalized_weights = DEFAULT_VARIABLE_WEIGHTS;
				}

				const cropWindows = [];
				cropLog.windows_stats = {
					total_windows: 0,
					insufficient_data: 0,
					valid_windows: 0,
				};

				// Process each potential window
				for (let i = 0; i <= forecastDf.length - duration; i += CONFIG.STEP_SIZE) {
					logData.summary.total_windows_processed += 1;
					cropLog.windows_stats.total_windows += 1;

					const windowDf = forecastDf.slice(i, i + duration);
					const windowStart = windowDf[0].date.toISOString().split("T")[0];

					// Check if we have enough valid data points
					let validValues = 0;
					let totalValues = duration * CONFIG.REQUIRED_FIELDS.length;

					// Count valid data points
					windowDf.forEach((day) => {
						CONFIG.REQUIRED_FIELDS.forEach((field) => {
							if (field in day && day[field] !== null && !isNaN(day[field])) {
								validValues++;
							}
						});
					});

					const dataRatio = validValues / totalValues;

					if (dataRatio < 1 - CONFIG.MAX_NAN_RATIO) {
						// Initialize window in log data
						if (!cropLog.windows[windowStart]) {
							cropLog.windows[windowStart] = {
								warnings: [
									`Insufficient data: ${(dataRatio * 100).toFixed(2)}% valid (need >${(
										(1 - CONFIG.MAX_NAN_RATIO) *
										100
									).toFixed(2)}%)`,
								],
							};
						} else {
							cropLog.windows[windowStart].warnings.push(
								`Insufficient data: ${(dataRatio * 100).toFixed(2)}% valid (need >${(
									(1 - CONFIG.MAX_NAN_RATIO) *
									100
								).toFixed(2)}%)`
							);
						}

						cropLog.windows_stats.insufficient_data += 1;
						logData.summary.windows_insufficient_data += 1;
						continue;
					}

					// Compute match score using crop-specific k values
					const [score, details] = computeScore(windowDf, cropDf, kValues, variableWeights, cropName, windowStart);

					if (score !== null) {
						cropLog.windows_stats.valid_windows += 1;
						logData.summary.windows_successful += 1;

						cropWindows.push({
							start: windowStart,
							score: Math.round(score * 10000) / 10000, // Round to 4 decimal places
							variable_details: details,
						});

						// Ensure we have this window in crop logs
						if (!cropLog.windows[windowStart]) {
							cropLog.windows[windowStart] = {
								variables: details,
								warnings: [],
								final_score: score,
							};
						} else {
							cropLog.windows[windowStart].final_score = score;
							cropLog.windows[windowStart].variables = details;
						}
					} else {
						if (!cropLog.windows[windowStart]) {
							cropLog.windows[windowStart] = {
								warnings: ["No valid score produced"],
								variables: {},
							};
						} else {
							cropLog.windows[windowStart].warnings.push("No valid score produced");
						}
					}
				}

				if (cropWindows.length > 0) {
					logData.summary.crops_successful += 1;

					// Sort windows by score (descending)
					cropWindows.sort((a, b) => b.score - a.score);

					// Store top scores
					cropLog.top_windows = cropWindows.slice(0, 3).map((w) => w.start);

					results.push({
						name: cropName,
						variety: crop.variety,
						region: crop.region,
						duration_days: duration,
						k_values_used: kValues,
						windows: cropWindows,
					});
				} else {
					logData.summary.crops_no_valid_windows += 1;
					cropLog.warnings.push("No valid windows found");
				}
			} catch (e) {
				const errorMsg = `Error processing crop '${cropName}': ${e.message}`;
				logError(errorMsg, cropName);

				// If the crop exists in log data, add the error there too
				if (logData.crop_logs[cropName]) {
					logData.crop_logs[cropName].warnings.push(errorMsg);
				}
			}
		}

		// Print summary
		console.log(`Crop matching completed. Summary:`);
		console.log(`  - Processed ${logData.summary.crops_processed} crops`);
		console.log(`  - ${logData.summary.crops_disqualified_duration} disqualified due to duration`);
		console.log(`  - ${logData.summary.crops_no_valid_windows} had no valid windows`);
		console.log(`  - ${logData.summary.crops_successful} successfully matched with windows`);

		return results;
	}

	// Run the algorithm
	const results = processCrops();

	return {
		results,
		logs: logData,
	};
}

module.exports = { runCropMatching };
