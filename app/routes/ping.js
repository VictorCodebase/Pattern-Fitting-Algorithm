const express = require("express");


const router = express.Router();

router.get("/", async (req, res) => {
    const raw_json_message = req.body || "none";
    const query_params_message = req.params.message || "none";

    res.status(200).json({
        message: "server reached",
        jsonMessage: raw_json_message,
        query_params: query_params_message
    })
})

module.exports = router