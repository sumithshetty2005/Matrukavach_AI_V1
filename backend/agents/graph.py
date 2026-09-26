import os
import json
from typing import TypedDict, List, Dict, Any, Annotated, Optional
from pydantic import BaseModel, Field

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph.message import add_messages

from .clinical import assess_clinical_risk, ClinicalVitals
from .geospatial import get_environmental_data, Coordinates
from .nutrition import generate_nutrition_advice
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq

# --- State Schemas ---
class PlanetaryIntelligence(BaseModel):
    temperature_c: float
    heat_index: float
    aqi: float
    toxins: float

class GraphState(TypedDict):
    mother_id: str
    name: str
    latitude: float   # <--- Add dynamic latitude
    longitude: float  # <--- Add dynamic longitude
    clinical_vitals: ClinicalVitals
    planetary_intelligence: PlanetaryIntelligence
    
    historical_hb: Optional[float]
    historical_bp: Optional[str]
    
    messages: Annotated[List[BaseMessage], add_messages]
    
    clinical_score: float
    clinical_flags: List[str]
    environmental_flags: List[str]
    final_risk_score: float
    risk_level: str

    escalation_status: str
    doctor_approval: bool
    doctor_override_notes: str

    environmental_impact: str
    clinical_justification: str
    nutrition_advice: Dict[str, List[str]]

class GuidanceOutput(BaseModel):
    clinical_risk_score: float = Field(description="Maternal clinical risk score from 1.0 to 10.0 based on vitals and environmental compounding.")
    risk_level: str = Field(description="Categorized risk: LOW, MODERATE, HIGH, or CRITICAL.")
    clinical_justification: str = Field(description="Detailed clinical justification citing environmental factors (temperature, AQI) and vitals.")
    clinical_dietary_plan: List[str] = Field(description="List of specific dietary recommendations.")
    environmental_safety_protocols: List[str] = Field(description="List of environmental safety protocols.")
    medication_monitoring: List[str] = Field(description="List of medication and monitoring recommendations.")

# --- Enterprise LLM Gateway ---
def get_llm_model(structured: bool = False):
    groq_api_key = os.environ.get("GROQ_API_KEY", "")
    google_api_key = os.environ.get("GOOGLE_API_KEY", "")
    
    models_to_try = [
        {"provider": "groq", "model": "openai/gpt-oss-120b", "key": groq_api_key},
        {"provider": "groq", "model": "qwen/qwen3.6-27b", "key": groq_api_key},
        {"provider": "google", "model": "gemini-2.5-flash", "key": google_api_key}
    ]
    
    for item in models_to_try:
        if not item["key"]:
            continue
        try:
            if item["provider"] == "groq":
                llm = ChatGroq(model_name=item["model"], temperature=0.1, groq_api_key=item["key"])
            else:
                llm = ChatGoogleGenerativeAI(model=item["model"], temperature=0.1, api_key=item["key"])
            
            if structured:
                return llm.with_structured_output(GuidanceOutput)
            return llm
        except Exception as e:
            print(f"Fallback model failed ({item['model']}): {e}")
            
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1, api_key=google_api_key)
    if structured:
        return llm.with_structured_output(GuidanceOutput)
    return llm

# --- Dedicated Sub-Agent Nodes ---

def clinical_agent_node(state: GraphState) -> Dict:
    """Agent 1: Analyzes clinical vitals and evaluates baseline physiological risks."""
    vitals = state["clinical_vitals"]
    res = assess_clinical_risk.invoke({
        "systolic_bp": vitals.systolic_bp,
        "diastolic_bp": vitals.diastolic_bp,
        "weight_kg": vitals.weight_kg,
        "hemoglobin": vitals.hemoglobin,
        "glucose": vitals.glucose,
        "gestational_age_weeks": vitals.gestational_age_weeks,
        "extra_symptoms": vitals.extra_symptoms or ""
    })
    return {
        "clinical_score": res.get("clinical_risk_score", 1.0),
        "clinical_flags": res.get("flags", [])
    }

def geospatial_agent_node(state: GraphState) -> Dict:
    """Agent 2: Dynamically fetches environmental indicators via Open-Meteo for the patient's location."""
    # Pull dynamic coordinates from state (with fallback to default if missing)
    lat = state.get("latitude", 19.072)
    lon = state.get("longitude", 72.882)
    
    # Invoke the tool function with dynamic coordinates
    env_res = get_environmental_data.invoke({
        "latitude": lat,
        "longitude": lon
    })
    
    flags = []
    heat_idx = env_res.get("heat_index", 30.0)
    pm25 = env_res.get("aqi_pm25", 50.0)
    
    if heat_idx > 35.0:
        flags.append(f"Elevated Heat Index ({heat_idx:.1f}°C)")
    if pm25 > 100.0:
        flags.append(f"High Ambient AQI/PM2.5 ({pm25:.1f})")
    
    if not flags:
        flags.append("Optimal Ambient Conditions (Temp & Air Quality Normal)")
        
    return {
        "environmental_flags": flags,
        "environmental_impact": env_res.get("message", "Environmental parameters monitored.")
    }

def evaluate_risk_node(state: GraphState) -> Dict:
    """Agent 3: Synthesizes clinical and environmental indicators against historical trends."""
    try:
        llm = get_llm_model(structured=True)
        
        prompt = f"""
        You are an expert AI Clinical Advisor evaluating maternal health risk based on the vitals, local environment parameters, and historical EHR baselines.
        
        Clinical Flags: {state.get('clinical_flags')}
        Environmental Flags: {state.get('environmental_flags')}
        
        Historical EHR Baselines:
        - Historical Hemoglobin: {state.get('historical_hb')} g/dL
        - Historical Blood Pressure: {state.get('historical_bp')} mmHg
        
        Current Vitals:
        - Hemoglobin: {state['clinical_vitals'].hemoglobin} g/dL
        - Blood Pressure: {state['clinical_vitals'].systolic_bp}/{state['clinical_vitals'].diastolic_bp} mmHg
        
        CRITICAL TASK: Cross-reference current vitals against historical EHR baselines. If hemoglobin has dropped significantly (>= 1.5 g/dL drop) or blood pressure has risen significantly (>= 20 mmHg systolic or >= 15 mmHg diastolic), flag this deteriorating trend in the justification and adjust the risk score.
        
        Provide the structured output matching the GuidanceOutput schema.
        """
        
        masked_prompt = prompt
        if state.get("name"):
            masked_prompt = prompt.replace(state["name"], "[PATIENT_ANONYMOUS]")
            
        response = llm.invoke([HumanMessage(content=masked_prompt)])
        
        return {
            "clinical_score": response.clinical_risk_score,
            "final_risk_score": response.clinical_risk_score,
            "risk_level": response.risk_level,
            "clinical_justification": response.clinical_justification,
            "nutrition_advice": {
                "Clinical Dietary Plan": response.clinical_dietary_plan,
                "Environmental Safety Protocols": response.environmental_safety_protocols,
                "Medication & Monitoring": response.medication_monitoring
            }
        }
    except Exception as e:
        print(f"Structured risk evaluation failed ({e}). Running deterministic fallback.")
        
        base_score = state.get("clinical_score", 1.0)
        clinical_flags = list(state.get("clinical_flags", []))
        environmental_flags = state.get("environmental_flags", [])
        
        # Historical trend analysis
        h_hb = state.get("historical_hb")
        h_bp = state.get("historical_bp")
        current_hb = state["clinical_vitals"].hemoglobin
        current_sbp = state["clinical_vitals"].systolic_bp
        current_dbp = state["clinical_vitals"].diastolic_bp
        
        justification_parts = []
        if h_hb is not None and (h_hb - current_hb) >= 1.5:
            base_score += 2.0
            justification_parts.append(f"Deteriorating Trend: Hb dropped from {h_hb} to {current_hb} g/dL")
            
        if h_bp:
            try:
                parts = h_bp.split("/")
                h_sbp = int(parts[0])
                h_dbp = int(parts[1]) if len(parts) > 1 else 80
                if (current_sbp - h_sbp) >= 20 or (current_dbp - h_dbp) >= 15:
                    base_score += 2.0
                    justification_parts.append(f"Deteriorating Trend: BP rose from {h_bp} to {current_sbp}/{current_dbp} mmHg")
            except Exception:
                pass

        multiplier = 1.0
        for flag in environmental_flags:
            if "Extreme Heat" in flag: multiplier += 0.3
            if "High PM2.5" in flag: multiplier += 0.2
            
        final_score = min(base_score * multiplier, 10.0)
        
        risk_level = "LOW"
        if final_score >= 4.0: risk_level = "MODERATE"
        if final_score >= 7.0: risk_level = "HIGH"
        if final_score >= 9.0: risk_level = "CRITICAL"
        
        fallback_justification = "System fallback activated. Vitals analyzed using local clinical rules."
        if justification_parts:
            fallback_justification += " Deteriorating maternal trends detected: " + "; ".join(justification_parts) + "."
        
        return {
            "final_risk_score": final_score,
            "risk_level": risk_level,
            "clinical_justification": fallback_justification
        }

def route_risk_level(state: GraphState) -> str:
    final_score = state.get("final_risk_score", 1.0)
    clinical_flags = state.get("clinical_flags", [])
    
    is_emergency = (final_score >= 7.0) or any(
        "Severe Hypertension" in f or "Preeclampsia" in f for f in clinical_flags
    )
    if is_emergency:
        return "emergency_agent"
    return "nutrition_agent"

def emergency_agent_node(state: GraphState) -> Dict:
    """Agent 4: Emergency escalation coordinator for critical health thresholds."""
    print(f"[ALERT] Emergency trigger activated for Mother ID: {state.get('mother_id')}")
    return {
        "escalation_status": "EMERGENCY_ALERT_DISPATCHED",
        "risk_level": "CRITICAL"
    }

def nutrition_agent_node(state: GraphState) -> Dict:
    """Agent 5: Generates tailored dietary and environmental nutrition protocols."""
    clinical_flags = state.get("clinical_flags", [])
    env = state.get("planetary_intelligence")
    weather_cond = "Heat" if (env and env.heat_index > 35) else "Clear"
    
    advice_list = generate_nutrition_advice.invoke({
        "clinical_flags": clinical_flags,
        "weather_condition": weather_cond
    })
    
    current_advice = state.get("nutrition_advice", {})
    current_advice.setdefault("Clinical Dietary Plan", []).extend(advice_list)
    
    return {"nutrition_advice": current_advice}

def generate_guidance_node(state: GraphState) -> Dict:
    """Agent 6: Final Synthesizer Agent incorporating doctor reviews/notes."""
    doctor_notes_str = f"\nDoctor Override/Approval Notes: {state.get('doctor_override_notes')}" if state.get("doctor_override_notes") else ""
    
    try:
        llm = get_llm_model(structured=True)
        prompt = f"""
        You are an expert AI Clinical Advisor synthesizing the final care plan.
        Review the findings from clinical, geospatial, and nutrition agents:
        - Clinical Flags: {state.get('clinical_flags')}
        - Environmental Flags: {state.get('environmental_flags')}
        - Final Score: {state.get('final_risk_score')}
        {doctor_notes_str}
        
        Provide the final structured output matching GuidanceOutput schema.
        """
        
        masked_prompt = prompt
        if state.get("name"):
            masked_prompt = prompt.replace(state["name"], "[PATIENT_ANONYMOUS]")
            
        response = llm.invoke([HumanMessage(content=masked_prompt)])
        
        return {
            "final_risk_score": response.clinical_risk_score,
            "risk_level": response.risk_level,
            "clinical_justification": response.clinical_justification,
            "nutrition_advice": {
                "Clinical Dietary Plan": response.clinical_dietary_plan,
                "Environmental Safety Protocols": response.environmental_safety_protocols,
                "Medication & Monitoring": response.medication_monitoring
            }
        }
    except Exception as e:
        print(f"Generate guidance synthesis failed ({e}). Preserving agent outputs.")
        return {
            "final_risk_score": state.get("final_risk_score", 1.0),
            "risk_level": state.get("risk_level", "LOW"),
            "clinical_justification": state.get("clinical_justification", "Standard clinical rules applied.")
        }

# --- Build Multi-Agent State Graph ---
builder = StateGraph(GraphState)

# Add explicit Multi-Agent Nodes
builder.add_node("clinical_agent", clinical_agent_node)
builder.add_node("geospatial_agent", geospatial_agent_node)
builder.add_node("evaluate_risk", evaluate_risk_node)
builder.add_node("emergency_agent", emergency_agent_node)
builder.add_node("nutrition_agent", nutrition_agent_node)
builder.add_node("generate_guidance", generate_guidance_node)

# Flow Execution Pipeline
builder.add_edge(START, "clinical_agent")
builder.add_edge("clinical_agent", "geospatial_agent")
builder.add_edge("geospatial_agent", "evaluate_risk")

builder.add_conditional_edges("evaluate_risk", route_risk_level, {
    "emergency_agent": "emergency_agent",
    "nutrition_agent": "nutrition_agent"
})

builder.add_edge("emergency_agent", "nutrition_agent")
builder.add_edge("nutrition_agent", "generate_guidance")
builder.add_edge("generate_guidance", END)

memory_checkpointer = MemorySaver()

# Compile graph with HITL checkpointing before generate_guidance
matrukavach_graph = builder.compile(
    checkpointer=memory_checkpointer,
    interrupt_before=["generate_guidance"]
)