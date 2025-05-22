const supabase = require("../../supabaseClient");
const moment = require("moment");
const axios = require("axios");
const fetchAll = require("../utils/fetchAll");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

class RealworkService {
  getIntegrationsToSync = async () => {
    console.log('🔍 Starting getIntegrationsToSync...');
    console.log('📡 Supabase Config:', {
      url: supabase.supabaseUrl,
      key: supabase.supabaseKey ? '***' + supabase.supabaseKey.slice(-4) : 'not set'
    });

    const { data: realworks, error: realworksError } = await supabase
      .from("integrations")
      .select("id")
      .eq("name", "realworks")
      .single();

    console.log('🔎 Realworks integration query result:', { 
      found: !!realworks, 
      error: realworksError,
      id: realworks?.id 
    });

    if (!realworks) {
      console.log('⚠️ No realworks integration found');
      return [];
    }

    const { data, error } = await supabase
      .from("integration_instances")
      .select("*")
      .or(`next_sync_at.gt.${moment().toISOString()}, next_sync_at.is.null`)
      .eq("integration_id", realworks.id);

    console.log('📊 Integration instances query result:', {
      count: data?.length || 0,
      error: error,
      firstInstance: data?.[0] ? {
        id: data[0].id,
        next_sync_at: data[0].next_sync_at
      } : null
    });

    if (error) {
      console.log("❌ Error fetching integration_instances", { error });
    }

    return data;
  };

  getClientFromRealworksId = async (realworksId, firmId) => {
    const res = await axios.get(
      `http://172.235.181.143/getRelation/${realworksId}?supabaseUrl=${supabaseUrl}&supabaseKey=${supabaseKey}&firmId=${firmId}`
    );

    if (res.status !== 200) return [];
    return res.data;
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

  getFirmAgenda = async (firmId, agendatypes) => {
    const startTime = moment().startOf("D").format("YYYY-MM-DD HH:mm:ss");
    const endTime = moment()
      .add(7, "days")
      .endOf("D")
      .format("YYYY-MM-DD HH:mm:ss");

    console.log("getFirmAgenda", { startTime, endTime });
    try {
      const agenda = await fetchAll(
        `http://172.235.181.143/getAfdelingAgenda/${firmId}?supabaseUrl=${supabaseUrl}&supabaseKey=${supabaseKey}&agendatypes=${agendatypes}&begintijdVanaf=${startTime}&begintijdTot=${endTime}`
      );

      return agenda;
    } catch (error) {
      console.error("Error get agenda:", error);
      return [];
    }
  };

  findBrokerByRealworkId = async (realworkBrokerId, firmId = null) => {
    const { data } = await supabase
      .from("external_attributes")
      .select("entity_id")
      .eq("attribute_name", "medewerkerIdAanmaker")
      .eq("attribute_value", realworkBrokerId)
      .eq("entity_type", "profile");

    if (!data || !data.length) {
      // If firmId is provided, try to find the default broker for this firm
      if (firmId) {
        console.log(
          `Broker ${realworkBrokerId} not found, trying firm default broker`
        );
        const { data: firmDefaultData } = await supabase
          .from("external_attributes")
          .select("attribute_value")
          .eq("attribute_name", "medewerkerIdAanmaker")
          .eq("entity_type", "firm_default")
          .eq("entity_id", firmId);

        if (firmDefaultData && firmDefaultData.length > 0) {
          const defaultBrokerId = firmDefaultData[0].attribute_value;

          // Now look up the profile for this default broker
          const { data: defaultBrokerProfile } = await supabase
            .from("external_attributes")
            .select("entity_id")
            .eq("attribute_name", "medewerkerIdAanmaker")
            .eq("attribute_value", defaultBrokerId)
            .eq("entity_type", "profile");

          if (defaultBrokerProfile && defaultBrokerProfile.length > 0) {
            console.log(`Using firm default broker instead`);
            return defaultBrokerProfile[0].entity_id;
          }
        }
      }

      console.log(
        `This broker is not connected to our system ${realworkBrokerId}`
      );
      return null;
    }

    return data[0].entity_id;
  };

  findProjectByProjectCode = async (projectCode) => {
    // First get the entity_id from external_attributes
    const { data: attributeData } = await supabase
      .from("external_attributes")
      .select("entity_id")
      .eq("attribute_name", "projectcode")
      .eq("attribute_value", projectCode)
      .eq("entity_type", "project");

    if (!attributeData || !attributeData.length) return null;

    const projectId = attributeData[0].entity_id;

    // Then look up the project status
    const { data: projectData } = await supabase
      .from("projects")
      .select("status")
      .eq("id", projectId)
      .single();

    // Skip projects with "deleted" or "archived" status
    if (
      projectData &&
      (projectData.status === "deleted" || projectData.status === "archived")
    ) {
      console.log(
        `Skipping project with code ${projectCode} because status is ${projectData.status}`
      );
      return null;
    }

    return projectId;
  };

  findClientByRealworkId = async (realworkClientId, firmId = null) => {
    const { data } = await supabase
      .from("external_attributes")
      .select("entity_id")
      .eq("attribute_name", "relationId")
      .eq("attribute_value", realworkClientId)
      .eq("entity_type", "client");

    if (!data || !data.length) {
      // If firmId is provided, try to find a default client for this firm
      if (firmId) {
        console.log(
          `Client ${realworkClientId} not found, trying firm default client`
        );
        const { data: firmDefaultData } = await supabase
          .from("external_attributes")
          .select("attribute_value")
          .eq("attribute_name", "defaultClientId")
          .eq("entity_type", "firm_default")
          .eq("entity_id", firmId);

        if (firmDefaultData && firmDefaultData.length > 0) {
          console.log(`Using firm default client instead`);
          return firmDefaultData[0].attribute_value;
        }
      }

      console.log(
        `This client is not connected to our system ${realworkClientId}`
      );
      return null;
    }

    //TODO: remove
    // return "56b50044-d01c-4e3e-a1d4-2094ccce5f63" ?? data[0].entity_id;
    return data[0].entity_id;
  };
}

module.exports = new RealworkService();
