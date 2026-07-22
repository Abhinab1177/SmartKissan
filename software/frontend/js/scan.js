const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const resultCard = document.getElementById("resultCard");

imageInput.addEventListener("change", function(){
    const file = this.files[0];

    if(file){
        const reader = new FileReader();

        reader.onload = function(){
            previewImage.src = reader.result;
            previewImage.style.display = "block";
        }

        reader.readAsDataURL(file);
    }
});

function analyzeImage(){

    if(!previewImage.src){
        alert("Please upload image first");
        return;
    }

    // Simulated ML Response (Temporary)
    const disease = "Leaf Blight";
    const infection = 67;
    const pesticide = "Copper Fungicide";
    const dose = "40ml per 15L tank";
    const interval = "Spray every 7 days";

    document.getElementById("diseaseName").innerText = disease;
    document.getElementById("infectionPercent").innerText = infection;
    document.getElementById("pesticideName").innerText = pesticide;
    document.getElementById("doseAmount").innerText = dose;
    document.getElementById("sprayInterval").innerText = interval;

    // Risk Level Logic
    let riskText = "";
    if(infection < 30){
        riskText = "Low (Safe)";
        resultCard.style.borderLeft = "6px solid green";
    }
    else if(infection < 60){
        riskText = "Moderate";
        resultCard.style.borderLeft = "6px solid orange";
    }
    else{
        riskText = "High (Severe)";
        resultCard.style.borderLeft = "6px solid red";
    }

    document.getElementById("riskLevel").innerText = riskText;

    resultCard.style.display = "block";
}
