/**
 * Weather data service
 * Handles fetching weather data from Open-Meteo API
 */
const axios = require("axios");
const { setupCache } = require("axios-cache-interceptor");

// Create cached axios instance
const axiosInstance = setupCache(axios.create(), {
	ttl: 60 * 60 * 1000, // 1 hour cache
});

/**
 * Format Open-Meteo params for axios request
 * @param {Object} params - The parameters to format
 * @returns {Object} - Formatted parameters
 */
function formatOpenMeteoParams(params) {
	const formattedParams = { ...params };

	// Handle arrays properly for axios
	if (params.daily && Array.isArray(params.daily)) {
		delete formattedParams.daily;
		formattedParams["daily[]"] = params.daily;
	}

	// Handle daily_2 parameter
	if (params.daily_2) {
		if (!formattedParams["daily[]"]) {
			formattedParams["daily[]"] = [];
		}
		if (Array.isArray(formattedParams["daily[]"])) {
			formattedParams["daily[]"].push(params.daily_2);
		} else {
			formattedParams["daily[]"] = [formattedParams["daily[]"], params.daily_2];
		}
		delete formattedParams.daily_2;
	}

	return formattedParams;
}

/**
 * Fetch weather data for crops
 * @param {Object} crops - The crops data object
 * @param {Object} weatherParams - Weather API parameters
 * @param {Object} logs - Logs object for tracking
 * @returns {Object} - Updated crops with weather data
 */
async function fetchCropWeatherData(crops, weatherParams, logs) {
	const updatedCrops = { ...crops };

	for (const cropName in updatedCrops) {
		try {
			const data = updatedCrops[cropName];
			const [latitude, longitude] = data.coordinates;
			const start = data.start_date;
			const end = data.end_date;

			const url = "https://climate-api.open-meteo.com/v1/climate";
			const params = {
				latitude,
				longitude,
				start_date: start,
				end_date: end,
				...weatherParams,
			};

			// Format parameters for axios
			const formattedParams = formatOpenMeteoParams(params);

			// Send request
			const response = await axiosInstance.get(url, { params: formattedParams });

			if (response.status === 200) {
				const json = response.data;
				const daily = json.daily;

				// Create daily weather array for this crop
				const dailyWeather = daily.time.map((date, i) => {
					const entry = { date };

					// Add each weather variable
					if (Array.isArray(weatherParams.daily)) {
						weatherParams.daily.forEach((param, j) => {
							entry[param] = daily[param][i];
						});
					}

					// Add daily_2 if present
					if (weatherParams.daily_2) {
						entry[weatherParams.daily_2] = daily[weatherParams.daily_2][i];
					}

					return entry;
				});

				// Update crop with weather data
				updatedCrops[cropName].daily_weather = dailyWeather;
				logs.crops_processed.push(cropName);
			} else {
				updatedCrops[cropName].daily_weather = null;
				logs.errors.push({
					crop: cropName,
					message: `Failed to fetch weather data: ${response.status} ${response.statusText}`,
				});
			}
		} catch (error) {
			updatedCrops[cropName].daily_weather = null;
			logs.errors.push({
				crop: cropName,
				message: `Error fetching weather data: ${error.message}`,
			});
		}
	}

	return updatedCrops;
}

module.exports = { fetchCropWeatherData };
