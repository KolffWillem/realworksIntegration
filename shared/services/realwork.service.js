const supabase = require("../../supabaseClient");
const moment = require("moment");
const axios = require("axios");
const fetchAll = require("../utils/fetchAll");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

class RealworkService {
  getIntegrationsToSync = async () => {
    const { data: realworks } = await supabase
      .from("integrations")
      .select("id")
      .eq("name", "realworks")
      .single();

    if (!realworks) return [];

    const { data, error } = await supabase
      .from("integration_instances")
      .select("*")
      .or(`next_sync_at.gt.${moment().toISOString()}, next_sync_at.is.null`)
      .eq("integration_id", realworks.id);

    if (error) {
      console.log("error  fetching integration_instances", { error });
    }

    return data;
  };

  getFirmTypes = async (firmId) => {
    const res = await axios.get(
      `http://172.235.181.143/getAgendaTypes/${firmId}?supabaseUrl=${supabaseUrl}&supabaseKey=${supabaseKey}`
    );

    if (res.status !== 200) return [];
    return res.data;
  };

  getFirmStatuses = async (firmId) => {
    const res = await axios.get(
      `http://172.235.181.143/getAgendaStatussen/${firmId}?supabaseUrl=${supabaseUrl}&supabaseKey=${supabaseKey}`
    );

    if (res.status !== 200) return [];
    return res.data;
  };

  getFirmAgenda = async (firmId) => {
    const startTime = moment().startOf("D").format("YYYY-MM-DD HH:mm:ss");
    const endTime = moment()
      .add(7, "days")
      .endOf("D")
      .format("YYYY-MM-DD HH:mm:ss");
    try {
      const res = await fetchAll(
        `http://172.235.181.143/getAfdelingAgenda/${firmId}?supabaseUrl=${supabaseUrl}&supabaseKey=${supabaseKey}&begintijdVanaf=${startTime}&begintijdTot=${endTime}`
      );
      return res;
    } catch (error) {
      console.error("Error get agenda:", error);
      return [];
    }
  };

  findBrokerByRealworkId = async (realworkBrokerId) => {
    const { data } = await supabase
      .from("external_attributes")
      .select("entity_id")
      .eq("attribute_name", "medewerkerIdAanmaker")
      .eq("attribute_value", realworkBrokerId)
      .eq("entity_type", "profile");

    //TODO: remove
    return "354a1db0-17cc-4ed3-b803-cef362bc02ed" ?? data[0].entity_id;

    if (!data || !data.length) return null;
  };

  findProjectByProjectCode = async (projectCode) => {
    const { data } = await supabase
      .from("external_attributes")
      .select("entity_id")
      .eq("attribute_name", "projectcode")
      .eq("attribute_value", projectCode)
      .eq("entity_type", "project");
    if (!data || !data.length) return null;

    return data[0].entity_id;
  };

  findClientByRealworkId = async (realworkClientId) => {
    const { data } = await supabase
      .from("external_attributes")
      .select("entity_id")
      .eq("attribute_name", "relationId")
      .eq("attribute_value", realworkClientId)
      .eq("entity_type", "client");
    //TODO: remove
    return "56b50044-d01c-4e3e-a1d4-2094ccce5f63" ?? data[0].entity_id;

    if (!data || !data.length) return null;
  };
}

module.exports = new RealworkService();
