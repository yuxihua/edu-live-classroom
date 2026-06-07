const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const getOpenMeetingsConfig = () => ({
  apiBaseUrl: normalizeBaseUrl(process.env.OPENMEETINGS_API_BASE_URL),
  roomBaseUrl: normalizeBaseUrl(process.env.OPENMEETINGS_ROOM_BASE_URL),
  username: String(process.env.OPENMEETINGS_API_USER || "").trim(),
  password: String(process.env.OPENMEETINGS_API_PASS || "").trim()
});

const getMissingOpenMeetingsConfigMessage = (config = getOpenMeetingsConfig()) => {
  if (!config.apiBaseUrl) return "OPENMEETINGS_API_BASE_URL is not configured";
  if (!config.username) return "OPENMEETINGS_API_USER is not configured";
  if (!config.password) return "OPENMEETINGS_API_PASS is not configured";
  if (!config.roomBaseUrl) return "OPENMEETINGS_ROOM_BASE_URL is not configured";
  return "";
};

const buildOpenMeetingsRoomUrl = (roomId, roomBaseUrl = process.env.OPENMEETINGS_ROOM_BASE_URL) => {
  const normalizedBaseUrl = normalizeBaseUrl(roomBaseUrl);
  const normalizedRoomId = Number(roomId || 0);
  if (!normalizedBaseUrl || !normalizedRoomId) {
    return null;
  }
  return `${normalizedBaseUrl}/${normalizedRoomId}`;
};

const parseJsonSafely = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
};

const resolveServicePayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  if (payload.serviceResult && typeof payload.serviceResult === "object") {
    return payload.serviceResult;
  }
  if (payload.result && typeof payload.result === "object") {
    return payload.result;
  }
  return payload;
};

const resolveServiceResultMessage = (payload) => {
  const servicePayload = resolveServicePayload(payload);
  if (!servicePayload) return "";
  const value = servicePayload.message ?? servicePayload.result ?? servicePayload.value ?? servicePayload.sid ?? servicePayload.raw ?? "";
  return String(value || "").trim();
};

const resolveServiceResultType = (payload) => {
  const servicePayload = resolveServicePayload(payload);
  if (!servicePayload) return "";
  return String(servicePayload.type || servicePayload.status || "").trim().toUpperCase();
};

const openMeetingsRequest = async (config, path, options = {}) => {
  const url = new URL(`${config.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  const searchParams = options.searchParams || {};
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const formData = options.formData || null;
  const jsonData = options.jsonData ?? null;
  let body;
  let headers = {};
  if (formData) {
    body = new URLSearchParams(Object.entries(formData).map(([key, value]) => [key, String(value ?? "")]));
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  } else if (jsonData !== null) {
    body = JSON.stringify(jsonData);
    headers["Content-Type"] = "application/json;charset=UTF-8";
  }

  if (options.headers && typeof options.headers === "object") {
    headers = { ...headers, ...options.headers };
  }

  const response = await fetch(url, {
    method: options.method || (body ? "POST" : "GET"),
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body
  });

  const text = await response.text();
  const payload = parseJsonSafely(text) ?? { raw: text };
  if (!response.ok) {
    const message = resolveServiceResultMessage(payload) || String(text || "").trim() || `OpenMeetings request failed with status ${response.status}`;
    const shortMessage = message.length > 260 ? `${message.slice(0, 260)}...` : message;
    const error = new Error(shortMessage || `OpenMeetings request failed with status ${response.status}`);
    error.status = response.status;
    error.responseText = text;
    throw error;
  }
  return payload;
};

const loginOpenMeetings = async (config) => {
  const payload = await openMeetingsRequest(config, "/user/login", {
    method: "POST",
    formData: {
      user: config.username,
      pass: config.password
    }
  });

  const resultType = resolveServiceResultType(payload);
  const resultMessage = resolveServiceResultMessage(payload);
  const sid = resultMessage;
  if (resultType && resultType !== "SUCCESS") {
    throw new Error(`Failed to authenticate with OpenMeetings: ${resultMessage || resultType}`);
  }
  if (!sid) {
    throw new Error("Failed to authenticate with OpenMeetings: empty sid returned");
  }
  return sid;
};

const normalizeRoomType = (value) => {
  const supported = new Set(["conference", "presentation", "interview"]);
  const normalized = String(value || "conference").trim().toLowerCase();
  return supported.has(normalized) ? normalized : "conference";
};

const toOpenMeetingsRoomTypeEnum = (value) => {
  const normalized = normalizeRoomType(value);
  const map = {
    conference: "CONFERENCE",
    presentation: "PRESENTATION",
    interview: "INTERVIEW"
  };
  return map[normalized] || "CONFERENCE";
};

export const createOpenMeetingsRoom = async ({
  name,
  type = "conference",
  capacity = 25,
  comment = "",
  moderated = false,
  isPublic = true,
  externalType = "edu-live-classroom",
  externalId = ""
}) => {
  const config = getOpenMeetingsConfig();
  const missingMessage = getMissingOpenMeetingsConfigMessage(config);
  if (missingMessage) {
    throw new Error(missingMessage);
  }

  const sid = await loginOpenMeetings(config);
  const normalizedRoomType = normalizeRoomType(type);
  const roomPayloadBase = {
    name: String(name || "").trim(),
    type: normalizedRoomType,
    capacity: Number.isFinite(Number(capacity)) && Number(capacity) > 0 ? Number(capacity) : 25,
    comment: String(comment || "").trim(),
    appointment: false,
    moderated: Boolean(moderated),
    isPublic: Boolean(isPublic),
    demo: false,
    closed: false,
    waitModerator: false,
    allowUserQuestions: true,
    allowRecording: true,
    waitRecording: false,
    audioOnly: false,
    externalType: String(externalType || "edu-live-classroom").trim(),
    externalId: String(externalId || "").trim()
  };

  if (!roomPayloadBase.name) {
    throw new Error("name is required");
  }

  const roomTypeNumberMap = {
    conference: 1,
    presentation: 3,
    interview: 4
  };

  const roomPayloadCandidates = [
    {
      ...roomPayloadBase,
      type: toOpenMeetingsRoomTypeEnum(roomPayloadBase.type)
    },
    roomPayloadBase,
    {
      name: roomPayloadBase.name,
      type: toOpenMeetingsRoomTypeEnum(roomPayloadBase.type),
      capacity: roomPayloadBase.capacity,
      comment: roomPayloadBase.comment,
      isPublic: Boolean(roomPayloadBase.isPublic)
    },
    {
      name: roomPayloadBase.name,
      type: roomTypeNumberMap[roomPayloadBase.type] || 1,
      capacity: roomPayloadBase.capacity,
      comment: roomPayloadBase.comment,
      isPublic: Boolean(roomPayloadBase.isPublic)
    }
  ];

  let payload = null;
  const attemptErrors = [];
  const resolveRoomId = (roomPayload) => {
    const serviceMessage = Number(resolveServiceResultMessage(roomPayload));
    return Number(roomPayload?.id || roomPayload?.roomId || roomPayload?.room?.id || roomPayload?.roomDTO?.id || serviceMessage || 0);
  };

  const requestAttempts = [];
  roomPayloadCandidates.forEach((roomPayload) => {
    requestAttempts.push({
      label: "POST /room form(room) + sid(query)",
      run: () => openMeetingsRequest(config, "/room", {
        method: "POST",
        searchParams: { sid },
        formData: { room: JSON.stringify(roomPayload) }
      })
    });
    requestAttempts.push({
      label: "POST /room/add form(room) + sid(query)",
      run: () => openMeetingsRequest(config, "/room/add", {
        method: "POST",
        searchParams: { sid },
        formData: { room: JSON.stringify(roomPayload) }
      })
    });
    requestAttempts.push({
      label: "POST /room/add form(room,sid)",
      run: () => openMeetingsRequest(config, "/room/add", {
        method: "POST",
        formData: {
          sid,
          room: JSON.stringify(roomPayload)
        }
      })
    });
    requestAttempts.push({
      label: "POST /room json(room) + sid(query)",
      run: () => openMeetingsRequest(config, "/room", {
        method: "POST",
        searchParams: { sid },
        jsonData: roomPayload
      })
    });
    requestAttempts.push({
      label: "POST /room/add json(room) + sid(query)",
      run: () => openMeetingsRequest(config, "/room/add", {
        method: "POST",
        searchParams: { sid },
        jsonData: roomPayload
      })
    });
    requestAttempts.push({
      label: "POST /room/add json({sid,room})",
      run: () => openMeetingsRequest(config, "/room/add", {
        method: "POST",
        jsonData: {
          sid,
          room: roomPayload
        }
      })
    });
  });

  for (const attempt of requestAttempts) {
    try {
      const result = await attempt.run();
      const roomId = resolveRoomId(result);
      if (roomId) {
        payload = result;
        break;
      }
      attemptErrors.push(`${attempt.label} => empty room id`);
    } catch (error) {
      const detail = String(error?.message || "unknown error").trim();
      attemptErrors.push(`${attempt.label} => ${detail}`);
    }
  }

  if (!payload) {
    const summary = attemptErrors.slice(0, 4).join(" | ");
    throw new Error(`Failed to create OpenMeetings room (${summary || "no details"})`);
  }

  const roomId = resolveRoomId(payload);
  if (!roomId) {
    throw new Error("Failed to create OpenMeetings room");
  }

  const meetingUrl = buildOpenMeetingsRoomUrl(roomId, config.roomBaseUrl);
  if (!meetingUrl) {
    throw new Error("OpenMeetings room URL could not be generated");
  }

  return {
    roomId,
    meetingUrl,
    roomName: String(payload?.name || payload?.roomDTO?.name || roomPayloadBase.name),
    roomType: normalizeRoomType(payload?.type || payload?.roomDTO?.type || roomPayloadBase.type),
    roomPayload: roomPayloadBase
  };
};

export const checkOpenMeetingsConnection = async () => {
  const config = getOpenMeetingsConfig();
  const missingMessage = getMissingOpenMeetingsConfigMessage(config);
  if (missingMessage) {
    throw new Error(missingMessage);
  }

  const sid = await loginOpenMeetings(config);
  return {
    ok: true,
    sidLength: sid.length,
    apiBaseUrl: config.apiBaseUrl,
    roomBaseUrl: config.roomBaseUrl
  };
};

export { buildOpenMeetingsRoomUrl, getMissingOpenMeetingsConfigMessage, getOpenMeetingsConfig };