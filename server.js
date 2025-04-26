const express = require("express")
const cors = require("cors")
const path = require("path")

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({limit: '50mb'}))
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const PORT = process.env.PORT || 3000;

// static content serve
app.use("/analytics/visualizations", express.static(path.join(__dirname, "analytics/visualizations")));


// Routes imports
const matchRoute = require("./app/routes/match.js");
const callibrateRoute = require("./app/routes/k_callibrate.js")
const visualizationsRoute = require("./app/routes/visualizations.js")
const pingRoute = require("./app/routes/ping.js")


// Routes
app.use("/run-engine", matchRoute);
app.use("/configure", callibrateRoute)
app.use("/visualizations", visualizationsRoute)
app.use("/", pingRoute)




// Start server
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
