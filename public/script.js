const photos = [];
let ratings = {};
let displayedPhotos = new Set();
let allPhotosRated = false;
let lastClickedPhoto = null;
let csrfToken = "";

function getCsrfToken() {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith("XSRF-TOKEN="))
    .split("=")[1];
}

// Function to add CSRF token to headers
function addCsrfHeader(headers = {}) {
  return {
    ...headers,
    "X-CSRF-Token": getCsrfToken(),
  };
}

fetch("/get-csrf-token", { credentials: "same-origin" })
  .then(() => {
    csrfToken = getCsrfToken();
    init();
  })
  .catch((error) => console.error("Error fetching CSRF token:", error));

Promise.all([
  fetch("/photos", {
    headers: addCsrfHeader(),
    credentials: "same-origin",
  }).then((response) => response.json()),
  fetch("/initial-ratings", {
    headers: addCsrfHeader(),
    credentials: "same-origin",
  }).then((response) => response.json()),
])
  .then(([photoData, ratingData]) => {
    photos.push(...photoData);
    ratings = ratingData;

    photos.forEach((photo) => {
      if (!(photo in ratings)) {
        ratings[photo] = 1000;
      }
    });

    init();
  })
  .catch((error) => {
    console.error("Error fetching initial data:", error);
  });

function getTopPhoto(excludePhoto) {
  const sortedPhotos = Object.entries(ratings)
    .filter(([photo]) => !displayedPhotos.has(photo) && photo !== excludePhoto)
    .sort((a, b) => b[1] - a[1]);

  if (sortedPhotos.length === 0) {
    if (lastClickedPhoto) {
      showWinner();
      return null;
    } else {
      displayedPhotos.clear();
      return getTopPhoto(excludePhoto);
    }
  }

  const [topPhoto] = sortedPhotos[0];
  displayedPhotos.add(topPhoto);

  return topPhoto;
}

function sendRatingsToServer() {
  fetch("/update-ratings", {
    method: "POST",
    headers: addCsrfHeader({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ ratings }),
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to update ratings");
      }
      return response.text();
    })
    .then((result) => console.log(result))
    .catch((error) => console.error("Error:", error));
}

function showWinner() {
  const winnerPhoto = lastClickedPhoto;
  const photoContainer = document.querySelector(".photo-container");
  const winnerContainer = document.getElementById("winnerContainer");
  const winnerPhotoElement = document.getElementById("winnerPhoto");
  const messageElement = document.getElementById("message");
  const refreshButton = document.getElementById("refreshButton");

  photoContainer.style.display = "none";
  winnerContainer.style.display = "flex";
  winnerPhotoElement.src = `./photos/${winnerPhoto}`;
  winnerPhotoElement.style.display = "block";
  messageElement.textContent =
    "No more photos to rate. This is the winning photo!";
  messageElement.style.display = "block";
  refreshButton.style.display = "block";

  winnerPhotoElement.animate(
    [
      { opacity: 0, transform: "scale(0.9)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    {
      duration: 500,
      easing: "ease-out",
    },
  );

  allPhotosRated = true;
}

window.addEventListener("close", (event) => {
  if (!allPhotosRated) {
    sendRatingsToServer();
  }
});

function updateRatings(winner, loser) {
  const k = 32;
  const ratingWinner = ratings[winner];
  const ratingLoser = ratings[loser];

  const expectedScoreWinner =
    1 / (1 + Math.pow(10, (ratingLoser - ratingWinner) / 400));

  ratings[winner] = ratingWinner + k * (1 - expectedScoreWinner);
  // ratings[loser] = ratingLoser + k * (expectedScoreWinner - 1);
}

const init = () => {
  const photo1Element = document.getElementById("photo1");
  const photo2Element = document.getElementById("photo2");

  if (!photo1Element || !photo2Element) {
    console.error("Photo elements not found.");
    return;
  }

  updatePhotos();

  photo1Element.onclick = () => {
    const winner = photo1Element.src.split("/").pop();
    const loser = photo2Element.src.split("/").pop();
    lastClickedPhoto = winner;
    updateRatings(winner, loser);
    updatePhoto(photo2Element, winner);
  };

  photo2Element.onclick = () => {
    const winner = photo2Element.src.split("/").pop();
    const loser = photo1Element.src.split("/").pop();
    lastClickedPhoto = winner;
    updateRatings(winner, loser);
    updatePhoto(photo1Element, winner);
  };
};

function updatePhotos() {
  const photo1 = getTopPhoto();
  const photo2 = getTopPhoto(photo1);

  if (!photo1 || !photo2) return;

  const photo1Element = document.getElementById("photo1");
  const photo2Element = document.getElementById("photo2");

  photo1Element.src = `./photos/${photo1}`;
  photo2Element.src = `./photos/${photo2}`;
}

function updatePhoto(photoElement, winnerPhoto) {
  const newPhoto = getTopPhoto(winnerPhoto);

  if (!newPhoto) {
    sendRatingsToServer();
    showWinner();
    return;
  }
  photoElement.src = `./photos/${newPhoto}`;
}
