import { Link } from "react-router-dom";
import logo from "../assets/logoL.svg"; 
import ApplianceCard from "../components/ApplianceCard"; 

// Import images for appliances
import washingMachineIcon from "../assets/washing-machine.svg";
import ovenIcon from "../assets/oven.svg";
import dishwasherIcon from "../assets/dishwasher.svg";

function DiagnoseStart() {
    return (
        <div className="container">
            {/* Main Logo */}
            <img src={logo} alt="Toloxa Logo" className="logo" />

            {/* Appliance Cards */}
            <div className="appliance-container">
                <ApplianceCard image={washingMachineIcon} title="Lave-linge" />
                <ApplianceCard image={ovenIcon} title="Four" />
                <ApplianceCard image={dishwasherIcon} title="Lave-vaisselle" />
            </div>

            <Link to="/vocal-assistant">
                <button className="button"><span>Démarrer</span></button>
            </Link>
        </div>
    );
}

export default DiagnoseStart;