import { useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/logoL.svg"; 
import ApplianceCard from "../components/ApplianceCard"; 

// Import images for appliances
import washingMachineIcon from "../assets/washing-machine.svg";
import ovenIcon from "../assets/oven.svg";
import dishwasherIcon from "../assets/dishwasher.svg";

function DiagnoseStart() {

    const [selectedAppliance, setSelectedAppliance] = useState(null);

    // Handle selection
    const handleSelect = (appliance) => {
        setSelectedAppliance(appliance);
    };

    return (
        <div className="container">
            {/* Main Logo */}
            <img src={logo} alt="Toloxa Logo" className="logo" />

            {/* Appliance Cards */}
            <div className="appliance-container">
                <ApplianceCard image={washingMachineIcon} title="Lave-linge"  selected={selectedAppliance === "WM"} onSelect={() => handleSelect("WM")}/>
                <ApplianceCard image={ovenIcon} title="Four" selected={selectedAppliance === "OVEN"} onSelect={() => handleSelect("OVEN")}/>
                <ApplianceCard image={dishwasherIcon} title="Lave-vaisselle" selected={selectedAppliance === "DW"} onSelect={() => handleSelect("DM")}/>
            </div>

            <div className="button-container">
                {selectedAppliance && (<Link 
                to="/vocal-assistant" 
                state={{ appliance: selectedAppliance }}
>
                    <button className={`button ${selectedAppliance ? "show" : ""}`}><span>Démarrer</span></button>
                </Link>)}
            </div>
        </div>
    );
}

export default DiagnoseStart;