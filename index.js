const express = require("express");
const axios = require("axios");
const app = express();
const port = 8080;

const CLIENT_ID = "YOUR_CLIENT_ID";
const CLIENT_SECRET = "YOUR_CLIENT_SECRET";
const REDIRECT_URI = "https://your-ngrok-url.ngrok-free.app/";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const PEOPLE_SEARCH_URL = "https://api.linkedin.com/v2/peopleSearch";

let accessToken = "";

app.get("/callback", async (req, res) => {
  const code = req.query.code;

  if (code) {
    try {
      const response = await axios.post(TOKEN_URL, null, {
        params: {
          grant_type: "authorization_code",
          code: code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      accessToken = response.data.access_token;
      res.send("Access token received. You can now fetch profiles.");
    } catch (error) {
      res.send(`Error: ${error.message}`);
    }
  } else {
    res.send("Authorization code not found.");
  }
});

app.get("/fetch-profiles", async (req, res) => {
  if (!accessToken) {
    return res
      .status(401)
      .send("Access token is missing. Please authenticate first.");
  }

  try {
    const response = await axios.get(PEOPLE_SEARCH_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        q: "search",
        filter: `university:` + req.query.university,
      },
    });

    const profiles = response.data.elements.map((profile) => ({
      name: profile.firstName + " " + profile.lastName,
      profilePicture: profile.profilePicture.displayImage,
    }));

    res.json(profiles);
  } catch (error) {
    res.send(`Error: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
