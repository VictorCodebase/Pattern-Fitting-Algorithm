/**
 * Visualization Service
 * Generates visualizations for crop data and K values
 */
const path = require("path");
const fs = require("fs");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

// Configure chart canvas size
const width = 800;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({
	width,
	height,
	backgroundColour: "white",
});

// Color palette for variables
const VARIABLE_COLORS = {
	temperature_2m_max: "rgba(255, 99, 132, 0.7)",
	temperature_2m_min: "rgba(54, 162, 235, 0.7)",
	soil_moisture_0_to_10cm_mean: "rgba(75, 192, 192, 0.7)",
	precipitation_sum: "rgba(153, 102, 255, 0.7)",
	relative_humidity_2m_mean: "rgba(255, 159, 64, 0.7)",
	wind_speed_10m_mean: "rgba(255, 205, 86, 0.7)",
};

/**
 * Get the correct chart configuration based on visualization type
 * @param {string} type - Type of visualization (crop-conditions or k-values)
 * @param {string} cropName - Name of the crop
 * @param {Object} cropData - Crop data
 * @returns {Object} - Chart.js configuration
 */
function getChartConfig(type, cropName, cropData) {
	if (type === "crop-conditions") {
		// For crop conditions, create a line chart with time series data
		const labels = cropData.daily_weather.map((d) => d.date);
		const datasets = [];

		// Create dataset for each variable
		for (const variable in VARIABLE_COLORS) {
			if (cropData.daily_weather.some((d) => variable in d)) {
				datasets.push({
					label: variable,
					data: cropData.daily_weather.map((d) => d[variable]),
					borderColor: VARIABLE_COLORS[variable],
					backgroundColor: VARIABLE_COLORS[variable].replace("0.7", "0.1"),
					borderWidth: 2,
					tension: 0.1,
					pointRadius: 1,
				});
			}
		}

		return {
			type: "line",
			data: {
				labels,
				datasets,
			},
			options: {
				responsive: true,
				plugins: {
					title: {
						display: true,
						text: `${cropName} (${cropData.variety}, ${cropData.region}) Weather Conditions`,
						font: { size: 16 },
					},
					legend: {
						position: "top",
					},
				},
				scales: {
					x: {
						display: true,
						title: {
							display: true,
							text: "Date",
						},
					},
					y: {
						display: true,
						title: {
							display: true,
							text: "Value",
						},
					},
				},
			},
		};
	} else if (type === "k-values") {
		// For k-values, create a radar chart
		const labels = Object.keys(cropData.k_values).filter((k) => cropData.k_values[k] !== null);
		const data = labels.map((k) => cropData.k_values[k]);

		return {
			type: "radar",
			data: {
				labels,
				datasets: [
					{
						label: "K Values",
						data,
						backgroundColor: "rgba(75, 192, 192, 0.2)",
						borderColor: "rgba(75, 192, 192, 1)",
						borderWidth: 2,
						pointBackgroundColor: Object.values(VARIABLE_COLORS).slice(0, labels.length),
					},
				],
			},
			options: {
				responsive: true,
				plugins: {
					title: {
						display: true,
						text: `${cropName} (${cropData.variety}) K-Value Distribution`,
						font: { size: 16 },
					},
					legend: {
						position: "top",
					},
				},
				scales: {
					r: {
						beginAtZero: true,
						min: 0,
						max: Math.max(...data) * 1.1,
						ticks: {
							stepSize: 1,
						},
					},
				},
			},
		};
	} else {
		// Bar chart for other types
		return {
			type: "bar",
			data: {
				labels: ["No valid visualization type"],
				datasets: [
					{
						label: "Error",
						data: [0],
						backgroundColor: "rgba(255, 99, 132, 0.2)",
						borderColor: "rgba(255, 99, 132, 1)",
						borderWidth: 1,
					},
				],
			},
		};
	}
}

/**
 * Generate visualizations for crops
 * @param {Object} crops - Crop data object
 * @param {string} outputDir - Directory to save visualizations
 * @param {string} type - Type of visualization (crop-conditions or k-values)
 * @param {Object} logs - Logs object for tracking
 * @returns {Array} - Array of visualization file paths
 */
async function generateVisualization(crops, outputDir, type, logs) {
	const visualizations = [];

	try {
		// Create output directory if it doesn't exist
		const typeDir = path.join(outputDir, type);
		if (!fs.existsSync(typeDir)) {
			fs.mkdirSync(typeDir, { recursive: true });
		}

		// Generate visualization for each crop
		for (const cropName in crops) {
			const cropData = crops[cropName];

			// Skip if no daily weather or k_values for respective visualization types
			if (
				(type === "crop-conditions" && (!cropData.daily_weather || cropData.daily_weather.length === 0)) ||
				(type === "k-values" && (!cropData.k_values || Object.keys(cropData.k_values).length === 0))
			) {
				logs.errors.push({
					crop: cropName,
					message: `Missing data for ${type} visualization`,
				});
				continue;
			}

			try {
				// Generate chart config and image
				const config = getChartConfig(type, cropName, cropData);
				const image = await chartJSNodeCanvas.renderToBuffer(config);

				// Save image
				const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
				const filename = `${cropName.replace(/\s+/g, "-")}_${type}_${timestamp}.png`;
				const filePath = path.join(typeDir, filename);

				fs.writeFileSync(filePath, image);

				visualizations.push({
					crop: cropName,
					type: type,
					path: filePath,
				});
			} catch (error) {
				logs.errors.push({
					crop: cropName,
					type: type,
					message: `Error generating visualization: ${error.message}`,
				});
			}
		}
	} catch (error) {
		logs.errors.push({
			message: `Error in visualization service: ${error.message}`,
		});
	}

	return visualizations;
}

module.exports = { generateVisualization };
