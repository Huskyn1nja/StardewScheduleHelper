import React, { useState, useRef, useEffect, useMemo } from "react";

const getTheme = (isDarkMode) =>
  isDarkMode
    ? {
        bg: "#121212",
        text: "#e0e0e0",
        border: "#2a2a2a",
        panelBg: "#1a1a1a",
        inputBg: "#262626",
        inputBorder: "#3a3a3a",
        accent: "#3b82f6",
        accentHover: "#2563eb",
        dangerBg: "#2a1818",
        dangerBorder: "#5f1a1a",
        dangerText: "#fca5a5",
        warningBg: "#2a2115",
        warningBorder: "#5f431a",
        warningText: "#fcd34d",
        successBg: "#162a1c",
        successText: "#86efac",
        tabBg: "#262626",
        tabActive: "#3b82f6",
      }
    : {
        bg: "#f3f4f6",
        text: "#1f2937",
        border: "#e5e7eb",
        panelBg: "#ffffff",
        inputBg: "#ffffff",
        inputBorder: "#d1d5db",
        accent: "#2563eb",
        accentHover: "#1d4ed8",
        dangerBg: "#fef2f2",
        dangerBorder: "#fca5a5",
        dangerText: "#dc2626",
        warningBg: "#fffbeb",
        warningBorder: "#fde68a",
        warningText: "#b45309",
        successBg: "#f0fdf4",
        successText: "#16a34a",
        tabBg: "#e5e7eb",
        tabActive: "#2563eb",
      };

const TmxUploader = () => {
  const [maps, setMaps] = useState({});
  const [activeMapId, setActiveMapId] = useState(null);
  const [images, setImages] = useState({});
  const [assetRepo, setAssetRepo] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [clickedCoord, setClickedCoord] = useState(null);
  const [tileWarning, setTileWarning] = useState(null);
  const [timeWarning, setTimeWarning] = useState(null);

  const [homeMapId, setHomeMapId] = useState("");
  const [homeX, setHomeX] = useState(0);
  const [homeY, setHomeY] = useState(0);

  const [schedules, setSchedules] = useState({ Mon: [] });
  const [activeScheduleKey, setActiveScheduleKey] = useState("Mon");
  const [newScheduleInput, setNewScheduleInput] = useState("");
  const [importInput, setImportInput] = useState("");

  const [draftTime, setDraftTime] = useState("0610");
  const [draftDirection, setDraftDirection] = useState("2");
  const [draftAnimation, setDraftAnimation] = useState("");
  const [draftDialogue, setDraftDialogue] = useState("");

  const [mapAliases, setMapAliases] = useState({});
  const [aliasInternal, setAliasInternal] = useState("");
  const [aliasFile, setAliasFile] = useState("");
  const [unresolvedWarp, setUnresolvedWarp] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [repoSearchTerm, setRepoSearchTerm] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState("workspace");
  const [zoomLevel, setZoomLevel] = useState(1);

  const canvasRef = useRef(null);
  const loadingImagesRef = useRef(new Set());

  const theme = useMemo(() => getTheme(isDarkMode), [isDarkMode]);
  const activeMap = useMemo(() => maps[activeMapId], [maps, activeMapId]);
  const scheduleNodes = useMemo(
    () => schedules[activeScheduleKey] || [],
    [schedules, activeScheduleKey]
  );
  const resolveMapId = (id) => {
    if (!id) return id;
    const lowerId = id.toLowerCase();
    for (const [internal, file] of Object.entries(mapAliases)) {
      if (internal.toLowerCase() === lowerId) return file;
    }
    return id;
  };

  const calculateDistance = (fromNode, toNode) => {
    const actualFromId = resolveMapId(fromNode.mapId);
    const actualToId = resolveMapId(toNode.mapId);

    if (actualFromId === actualToId) {
      return Math.abs(toNode.x - fromNode.x) + Math.abs(toNode.y - fromNode.y);
    }
    const prevMapData = maps[actualFromId];
    if (prevMapData?.mapWarps) {
      for (const portal of prevMapData.mapWarps) {
        const target = resolveMapId(portal.targetMap);
        if (target.toLowerCase() === actualToId.toLowerCase()) {
          return (
            Math.abs(portal.x - fromNode.x) +
            Math.abs(portal.y - fromNode.y) +
            (Math.abs(toNode.x - portal.destX) +
              Math.abs(toNode.y - portal.destY)) +
            15
          );
        }
      }
    }
    return 35;
  };
  const handleFolderSelect = (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const repo = { ...assetRepo };
    files.forEach((file) => {
      repo[file.name] = file;
    });
    setAssetRepo(repo);
  };

  const processTmxFiles = async (tmxFiles) => {
    const newMaps = { ...maps };
    let firstNewMapId = null;

    for (const file of tmxFiles) {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");

      const mapId = file.name.replace(/\.tmx$/i, "");
      if (!firstNewMapId) firstNewMapId = mapId;

      const mapElement = xmlDoc.querySelector("map");
      if (!mapElement) continue;

      const parsedData = {
        width: parseInt(mapElement.getAttribute("width"), 10),
        height: parseInt(mapElement.getAttribute("height"), 10),
        tileWidth: parseInt(mapElement.getAttribute("tilewidth"), 10),
        tileHeight: parseInt(mapElement.getAttribute("tileheight"), 10),
      };

      const mapProperties = {};
      const propertiesElement = xmlDoc.querySelector("map > properties");
      if (propertiesElement) {
        propertiesElement.querySelectorAll("property").forEach((prop) => {
          mapProperties[prop.getAttribute("name")] = prop.getAttribute("value");
        });
      }

      const tilesetElements = xmlDoc.querySelectorAll("tileset");
      const parsedTilesets = Array.from(tilesetElements)
        .map((ts) => {
          const imageElement = ts.querySelector("image");
          let filename = "external tsx";
          if (imageElement) {
            filename = imageElement
              .getAttribute("source")
              .split(/[/\\]/)
              .pop()
              .toLowerCase();
            if (!filename.endsWith(".png")) filename += ".png";
          }
          return {
            firstgid: parseInt(ts.getAttribute("firstgid"), 10),
            name: ts.getAttribute("name"),
            source: filename,
          };
        })
        .filter((ts) => ts.name.toLowerCase() !== "paths");

      const layerElements = xmlDoc.querySelectorAll("layer");
      const parsedLayers = Array.from(layerElements)
        .map((layer) => {
          const dataElement = layer.querySelector("data");
          const encoding = dataElement
            ? dataElement.getAttribute("encoding")
            : null;
          let dataArray = [];

          if (encoding === "csv" && dataElement) {
            dataArray = dataElement.textContent
              .trim()
              .split(",")
              .map((num) => parseInt(num, 10));
          }

          return {
            name: layer.getAttribute("name"),
            width: parseInt(layer.getAttribute("width"), 10),
            height: parseInt(layer.getAttribute("height"), 10),
            encoding: encoding,
            data: dataArray,
          };
        })
        .filter((layer) => layer.name.toLowerCase() !== "paths");

      const usedTilesetSources = new Set();
      parsedLayers.forEach((layer) => {
        if (!layer.data) return;
        layer.data.forEach((tileId) => {
          if (tileId === 0) return;
          for (let i = parsedTilesets.length - 1; i >= 0; i--) {
            if (tileId >= parsedTilesets[i].firstgid) {
              usedTilesetSources.add(parsedTilesets[i].source);
              break;
            }
          }
        });
      });

      const mapWarps = [];

      if (mapProperties.Warp) {
        const tokens = mapProperties.Warp.trim().split(/\s+/);
        for (let i = 0; i < tokens.length; i += 5) {
          mapWarps.push({
            x: parseInt(tokens[i], 10),
            y: parseInt(tokens[i + 1], 10),
            targetMap: tokens[i + 2],
            destX: parseInt(tokens[i + 3], 10),
            destY: parseInt(tokens[i + 4], 10),
          });
        }
      }

      xmlDoc.querySelectorAll("objectgroup object").forEach((obj) => {
        const props = Array.from(obj.querySelectorAll("property")).reduce(
          (acc, p) => {
            acc[p.getAttribute("name")] = p.getAttribute("value");
            return acc;
          },
          {}
        );

        const action =
          props["TouchAction"] ||
          props["Action"] ||
          obj.getAttribute("type") ||
          obj.getAttribute("name");
        if (action) {
          const tokens = action.trim().split(/\s+/);
          const cmd = tokens[0].toLowerCase();
          let targetMap = null;
          let destX = 0;
          let destY = 0;

          if (cmd === "warp" || cmd === "lockeddoorwarp") {
            targetMap = tokens[3];
            destX = parseInt(tokens[1], 10);
            destY = parseInt(tokens[2], 10);
          } else if (cmd === "magicwarp") {
            targetMap = tokens[1];
            destX = parseInt(tokens[2], 10);
            destY = parseInt(tokens[3], 10);
          }

          if (targetMap) {
            const objX = Math.floor(
              parseInt(obj.getAttribute("x"), 10) / parsedData.tileWidth
            );
            const objY = Math.floor(
              parseInt(obj.getAttribute("y"), 10) / parsedData.tileHeight
            );
            if (!isNaN(objX) && !isNaN(objY)) {
              mapWarps.push({ x: objX, y: objY, targetMap, destX, destY });
            }
          }
        }
      });

      const tileActions = {};
      Array.from(tilesetElements).forEach((ts) => {
        const firstgid = parseInt(ts.getAttribute("firstgid"), 10);
        ts.querySelectorAll("tile").forEach((tile) => {
          const localId = parseInt(tile.getAttribute("id"), 10);
          const props = Array.from(tile.querySelectorAll("property"));
          const actionProp = props.find(
            (p) =>
              p.getAttribute("name") === "TouchAction" ||
              p.getAttribute("name") === "Action"
          );
          if (actionProp) {
            tileActions[firstgid + localId] = actionProp.getAttribute("value");
          }
        });
      });

      parsedLayers.forEach((layer) => {
        if (!layer.data) return;
        layer.data.forEach((gid, index) => {
          if (tileActions[gid]) {
            const x = index % parsedData.width;
            const y = Math.floor(index / parsedData.width);
            const tokens = tileActions[gid].trim().split(/\s+/);
            const cmd = tokens[0].toLowerCase();
            let targetMap = null;
            let destX = 0;
            let destY = 0;

            if (cmd === "warp" || cmd === "lockeddoorwarp") {
              targetMap = tokens[3];
              destX = parseInt(tokens[1], 10);
              destY = parseInt(tokens[2], 10);
            } else if (cmd === "magicwarp") {
              targetMap = tokens[1];
              destX = parseInt(tokens[2], 10);
              destY = parseInt(tokens[3], 10);
            }

            if (targetMap) {
              mapWarps.push({ x, y, targetMap, destX, destY });
            }
          }
        });
      });

      const requiredTilesets = parsedTilesets.filter((ts) =>
        usedTilesetSources.has(ts.source)
      );

      newMaps[mapId] = {
        id: mapId,
        mapData: parsedData,
        mapProperties: mapProperties,
        tilesets: requiredTilesets,
        layers: parsedLayers,
        mapWarps: mapWarps,
      };
    }

    setMaps((prevMaps) => ({ ...prevMaps, ...newMaps }));
    if (!activeMapId && firstNewMapId) setActiveMapId(firstNewMapId);
  };

  const processPngFiles = async (pngFiles) => {
    const loadPromises = pngFiles.map((file) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ name: file.name, img });
        img.onerror = () => resolve({ name: file.name, img: null });
        img.src = URL.createObjectURL(file);
      });
    });

    const loadedImages = await Promise.all(loadPromises);
    const newImages = {};
    loadedImages.forEach(({ name, img }) => {
      const lowerName = name.toLowerCase();
      newImages[lowerName] = img || "FAILED";
      loadingImagesRef.current.delete(lowerName);
    });

    setImages((prev) => ({ ...prev, ...newImages }));
  };

  const parseConfigFile = async (file) => {
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      if (config.mapAliases) setMapAliases(config.mapAliases);
      if (config.schedules) setSchedules(config.schedules);
      if (config.homeMapId) setHomeMapId(config.homeMapId);
      if (config.homeX !== undefined) setHomeX(config.homeX);
      if (config.homeY !== undefined) setHomeY(config.homeY);

      const firstKey = Object.keys(config.schedules || {})[0];
      if (firstKey) setActiveScheduleKey(firstKey);

      alert("Project Configuration loaded successfully!");
    } catch (e) {
      alert("Failed to parse config JSON. Ensure it is a valid project file.");
    }
  };

  const handleFileDropOrSelect = (eventOrFiles) => {
    let files = Array.from(
      eventOrFiles.target ? eventOrFiles.target.files : eventOrFiles
    );

    const configFiles = files.filter((f) => f.name.endsWith(".json"));
    if (configFiles.length > 0) {
      parseConfigFile(configFiles[0]);
    }

    const tmxFiles = files.filter((f) => f.name.endsWith(".tmx"));
    const pngFiles = files.filter((f) => f.name.endsWith(".png"));

    if (tmxFiles.length > 0) processTmxFiles(tmxFiles);
    if (pngFiles.length > 0) processPngFiles(pngFiles);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const traverseFileTree = (item) => {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file) => resolve([file]));
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const allEntries = [];

        const readEntries = () => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              const filePromises = allEntries.map((entry) =>
                traverseFileTree(entry)
              );
              const nestedFilesArray = await Promise.all(filePromises);
              resolve(nestedFilesArray.flat());
            } else {
              allEntries.push(...entries);
              readEntries();
            }
          });
        };
        readEntries();
      } else {
        resolve([]);
      }
    });
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;

    const entryPromises = items
      .filter((item) => item.kind === "file")
      .map((item) => item.webkitGetAsEntry())
      .filter((entry) => entry !== null)
      .map((entry) => traverseFileTree(entry));

    const filesArray = await Promise.all(entryPromises);
    const flatFiles = filesArray.flat();

    const repo = { ...assetRepo };
    flatFiles.forEach((file) => {
      repo[file.name] = file;
    });
    setAssetRepo(repo);

    handleFileDropOrSelect(flatFiles);
  };

  const handleCanvasClick = (e) => {
    if (!activeMapId || !maps[activeMapId] || !canvasRef.current) return;
    const map = maps[activeMapId];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(
      (e.clientX - rect.left) / (map.mapData.tileWidth * zoomLevel)
    );
    const y = Math.floor(
      (e.clientY - rect.top) / (map.mapData.tileHeight * zoomLevel)
    );

    setClickedCoord({ mapId: activeMapId, x, y });

    const buildingLayers = map.layers.filter((l) =>
      l.name.toLowerCase().includes("building")
    );
    let isBlocked = false;
    for (let layer of buildingLayers) {
      const tileIndex = y * map.mapData.width + x;
      if (layer.data && layer.data[tileIndex] !== 0) {
        isBlocked = true;
        break;
      }
    }
    setTileWarning(
      isBlocked
        ? "Impassable tile: An object exists here on a Buildings layer."
        : null
    );
  };

  const handleCanvasDoubleClick = async (e) => {
    if (!activeMapId || !maps[activeMapId] || !canvasRef.current) return;
    const map = maps[activeMapId];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(
      (e.clientX - rect.left) / (map.mapData.tileWidth * zoomLevel)
    );
    const y = Math.floor(
      (e.clientY - rect.top) / (map.mapData.tileHeight * zoomLevel)
    );

    const portal = map.mapWarps?.find((w) => w.x === x && w.y === y);
    if (portal) {
      const targetMapId = portal.targetMap;
      const actualMapId = resolveMapId(targetMapId);

      if (maps[actualMapId]) {
        setActiveMapId(actualMapId);
      } else {
        const repoKey = Object.keys(assetRepo).find(
          (k) => k.toLowerCase() === actualMapId.toLowerCase() + ".tmx"
        );
        if (repoKey) {
          await processTmxFiles([assetRepo[repoKey]]);
          setActiveMapId(repoKey.replace(/\.tmx$/i, ""));
        } else {
          setUnresolvedWarp(targetMapId);
        }
      }
    }
  };

  const handleResolveWarp = async (selectedFileName) => {
    if (!unresolvedWarp || !selectedFileName) return;

    const targetMapId = unresolvedWarp;
    const actualMapId = selectedFileName.replace(/\.tmx$/i, "");

    setMapAliases((prev) => ({ ...prev, [targetMapId]: actualMapId }));

    if (maps[actualMapId]) {
      setActiveMapId(actualMapId);
    } else if (assetRepo[selectedFileName]) {
      await processTmxFiles([assetRepo[selectedFileName]]);
      setActiveMapId(actualMapId);
    }

    setUnresolvedWarp(null);
  };

  const handleCreateScheduleKey = () => {
    const cleanKey = newScheduleInput.trim();
    if (!cleanKey || schedules[cleanKey]) return;
    setSchedules((prev) => ({ ...prev, [cleanKey]: [] }));
    setActiveScheduleKey(cleanKey);
    setNewScheduleInput("");
  };
  const handleImportSchedule = () => {
    const cleanInput = importInput.trim();
    if (!cleanInput) return;

    let parsedJson = null;
    try {
      parsedJson = JSON.parse(cleanInput);
    } catch (e) {
      try {
        const wrapped = `{${cleanInput}}`;
        parsedJson = JSON.parse(wrapped);
      } catch (e2) {}
    }

    const newSchedules = { ...schedules };
    if (newSchedules["Mon"] && newSchedules["Mon"].length === 0)
      delete newSchedules["Mon"];
    if (newSchedules["default"]) delete newSchedules["default"];

    let importedCount = 0;

    if (parsedJson && typeof parsedJson === "object") {
      for (let [key, value] of Object.entries(parsedJson)) {
        if (typeof value !== "string") continue;
        if (key.toLowerCase() === "default") key = "Mon";

        const nodes = [];
        const entries = value.split("/");
        entries.forEach((entry) => {
          const tokens = entry.trim().split(/\s+/);
          if (tokens.length >= 5) {
            const time = tokens[0];
            const mapId = tokens[1];
            const x = parseInt(tokens[2], 10);
            const y = parseInt(tokens[3], 10);
            const direction = tokens[4];
            const animation = tokens.slice(5).join(" ");
            if (!isNaN(x) && !isNaN(y) && /^\d+$/.test(time)) {
              nodes.push({
                time,
                mapId,
                x,
                y,
                direction,
                animation,
                dialogue: "",
              });
              importedCount++;
            }
          }
        });
        if (nodes.length > 0) {
          nodes.sort((a, b) => parseInt(a.time, 10) - parseInt(b.time, 10));
          newSchedules[key] = nodes;
        }
      }
    } else {
      const lines = cleanInput.split("\n");
      let currentKey =
        activeScheduleKey.toLowerCase() === "default"
          ? "Mon"
          : activeScheduleKey;

      lines.forEach((line) => {
        const lineTrimmed = line.trim();
        if (!lineTrimmed) return;

        let scheduleData = lineTrimmed;
        const colonIndex = lineTrimmed.indexOf(":");

        if (colonIndex > 0) {
          const possibleKey = lineTrimmed
            .substring(0, colonIndex)
            .trim()
            .replace(/['"]/g, "");
          if (possibleKey && !/^\d+$/.test(possibleKey)) {
            currentKey =
              possibleKey.toLowerCase() === "default" ? "Mon" : possibleKey;
            scheduleData = lineTrimmed
              .substring(colonIndex + 1)
              .trim()
              .replace(/^['"]|['",]$/g, "");
          }
        }

        if (!newSchedules[currentKey]) {
          newSchedules[currentKey] = [];
        }

        const entries = scheduleData.split("/");
        entries.forEach((entry) => {
          const tokens = entry.trim().split(/\s+/);
          if (tokens.length >= 5) {
            const time = tokens[0];
            const mapId = tokens[1];
            const x = parseInt(tokens[2], 10);
            const y = parseInt(tokens[3], 10);
            const direction = tokens[4];
            const animation = tokens.slice(5).join(" ");

            if (!isNaN(x) && !isNaN(y) && /^\d+$/.test(time)) {
              newSchedules[currentKey].push({
                time,
                mapId,
                x,
                y,
                direction,
                animation,
                dialogue: "",
              });
              importedCount++;
            }
          }
        });
      });

      for (const key in newSchedules) {
        newSchedules[key].sort(
          (a, b) => parseInt(a.time, 10) - parseInt(b.time, 10)
        );
      }
    }

    if (importedCount > 0) {
      setSchedules(newSchedules);
      const keys = Object.keys(newSchedules);
      if (keys.length > 0) {
        if (
          !newSchedules[activeScheduleKey] ||
          activeScheduleKey.toLowerCase() === "default"
        ) {
          setActiveScheduleKey(keys.includes("Mon") ? "Mon" : keys[0]);
        }
      }
      setImportInput("");
      alert(`Imported ${importedCount} checkpoints successfully!`);
    } else {
      alert(
        "Failed to interpret formatting rules. Ensure lines match: Time Location X Y Direction"
      );
    }
  };

  const handleTimeBlur = () => {
    let timeInt = parseInt(draftTime.replace(/\D/g, ""), 10);
    if (isNaN(timeInt)) {
      setDraftTime("0610");
      return;
    }
    let m = timeInt % 100;
    let h = Math.floor(timeInt / 100);
    if (m >= 60) {
      h += Math.floor(m / 60);
      m = m % 60;
    }
    m = Math.ceil(m / 10) * 10;
    if (m === 60) {
      h += 1;
      m = 0;
    }
    setDraftTime(`${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`);
  };

  const addScheduleNode = () => {
    if (!clickedCoord) return;

    let formattedTime = draftTime.toString().replace(/\D/g, "");
    let timeInt = parseInt(formattedTime, 10);
    if (isNaN(timeInt)) timeInt = 610;

    let m = timeInt % 100;
    let h = Math.floor(timeInt / 100);
    if (m >= 60) {
      h += Math.floor(m / 60);
      m = m % 60;
    }
    m = Math.ceil(m / 10) * 10;
    if (m === 60) {
      h += 1;
      m = 0;
    }
    formattedTime = `${String(h).padStart(2, "0")}${String(m).padStart(
      2,
      "0"
    )}`;

    const newNode = {
      time: formattedTime,
      mapId: clickedCoord.mapId,
      x: clickedCoord.x,
      y: clickedCoord.y,
      direction: draftDirection,
      animation: draftAnimation.trim(),
      dialogue: draftDialogue.trim(),
    };

    const updatedNodes = [...scheduleNodes, newNode].sort(
      (a, b) => parseInt(a.time) - parseInt(b.time)
    );
    setSchedules((prev) => ({ ...prev, [activeScheduleKey]: updatedNodes }));

    const nodeIndex = updatedNodes.findIndex((n) => n === newNode);
    let prevNode;
    if (nodeIndex === 0) {
      prevNode = {
        mapId: homeMapId || newNode.mapId,
        x: homeMapId ? homeX : newNode.x,
        y: homeMapId ? homeY : newNode.y,
      };
    } else {
      prevNode = updatedNodes[nodeIndex - 1];
    }

    const currTimeRaw = parseInt(newNode.time, 10);
    const departureMinutes =
      Math.floor(currTimeRaw / 100) * 60 + (currTimeRaw % 100);
    const travelTime = calculateDistance(prevNode, newNode);

    let totalArrivalMinutes = departureMinutes + travelTime;
    totalArrivalMinutes = Math.ceil(totalArrivalMinutes / 10) * 10;
    totalArrivalMinutes += 10;

    const nextHour = Math.floor(totalArrivalMinutes / 60);
    const nextMin = totalArrivalMinutes % 60;
    const nextTimeString = `${String(nextHour).padStart(2, "0")}${String(
      nextMin
    ).padStart(2, "0")}`;

    setDraftTime(nextTimeString);
    setDraftAnimation("");
    setDraftDialogue("");
  };

  const updateScheduleNode = (index, field, value) => {
    const newNodes = [...scheduleNodes];
    newNodes[index] = { ...newNodes[index], [field]: value };
    setSchedules((prev) => ({ ...prev, [activeScheduleKey]: newNodes }));
  };

  const moveScheduleNode = (index, direction) => {
    if (index + direction < 0 || index + direction >= scheduleNodes.length)
      return;
    const newNodes = [...scheduleNodes];
    const temp = newNodes[index];
    newNodes[index] = newNodes[index + direction];
    newNodes[index + direction] = temp;
    setSchedules((prev) => ({ ...prev, [activeScheduleKey]: newNodes }));
  };

  const addAlias = () => {
    if (aliasInternal.trim() && aliasFile.trim()) {
      setMapAliases((prev) => ({
        ...prev,
        [aliasInternal.trim()]: aliasFile.trim(),
      }));
      setAliasInternal("");
      setAliasFile("");
    }
  };

  const exportProjectConfig = () => {
    const config = {
      homeMapId,
      homeX,
      homeY,
      mapAliases,
      schedules,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stardew_schedule_config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatedScheduleString = useMemo(() => {
    return scheduleNodes
      .map((node) => {
        const animPart = node.animation ? ` ${node.animation}` : "";
        return `${node.time} ${node.mapId} ${node.x} ${node.y} ${node.direction}${animPart}`;
      })
      .join("/");
  }, [scheduleNodes]);

  const generatedFullScheduleJSON = useMemo(() => {
    const output = {};
    for (const [key, nodes] of Object.entries(schedules)) {
      if (nodes.length > 0) {
        output[key] = nodes
          .map((node) => {
            const animPart = node.animation ? ` ${node.animation}` : "";
            return `${node.time} ${node.mapId} ${node.x} ${node.y} ${node.direction}${animPart}`;
          })
          .join("/");
      }
    }
    return JSON.stringify(output, null, 2);
  }, [schedules]);

  const generatedDialogueString = useMemo(() => {
    const dialogueLines = scheduleNodes
      .filter((node) => node.dialogue)
      .map((node) => `"${node.mapId}_${node.x}_${node.y}": "${node.dialogue}"`);
    return dialogueLines.join(",\n");
  }, [scheduleNodes]);

  const getArrivalEstimate = (index) => {
    const currNode = scheduleNodes[index];
    let prevNode;

    if (index === 0) {
      prevNode = {
        mapId: homeMapId || currNode.mapId,
        x: homeMapId ? homeX : currNode.x,
        y: homeMapId ? homeY : currNode.y,
      };
    } else {
      prevNode = scheduleNodes[index - 1];
    }

    const currTimeRaw = parseInt(currNode.time, 10);
    const departureMinutes =
      Math.floor(currTimeRaw / 100) * 60 + (currTimeRaw % 100);
    const travelTime = calculateDistance(prevNode, currNode);

    let totalArrivalMinutes = departureMinutes + travelTime;
    totalArrivalMinutes = Math.ceil(totalArrivalMinutes / 10) * 10;

    const arrivalHour = Math.floor(totalArrivalMinutes / 60);
    const arrivalMin = totalArrivalMinutes % 60;
    const timeString = `${String(arrivalHour).padStart(2, "0")}${String(
      arrivalMin
    ).padStart(2, "0")}`;

    return `Arrival: ${timeString}`;
  };

  const copyToClipboard = (textToCopy) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert("Copied to clipboard successfully!");
    });
  };

  useEffect(() => {
    setClickedCoord(null);
    setTileWarning(null);
  }, [activeMapId]);

  useEffect(() => {
    if (!clickedCoord || !draftTime) {
      setTimeWarning(null);
      return;
    }

    const parsedDraftTime = parseInt(draftTime, 10);
    if (isNaN(parsedDraftTime)) {
      setTimeWarning(null);
      return;
    }

    const draftMinutes =
      Math.floor(parsedDraftTime / 100) * 60 + (parsedDraftTime % 100);

    let prevNode = null;
    let nextNode = null;
    let prevNodeIdx = -1;

    const sortedExisting = [...scheduleNodes].sort(
      (a, b) => parseInt(a.time, 10) - parseInt(b.time, 10)
    );

    for (let i = 0; i < sortedExisting.length; i++) {
      const t = parseInt(sortedExisting[i].time, 10);
      const m = Math.floor(t / 100) * 60 + (t % 100);
      if (m <= draftMinutes) {
        prevNode = sortedExisting[i];
        prevNodeIdx = i;
      } else {
        nextNode = sortedExisting[i];
        break;
      }
    }

    let timeWarnStr = null;

    if (nextNode) {
      const currentLegTravel = calculateDistance(
        { mapId: clickedCoord.mapId, x: clickedCoord.x, y: clickedCoord.y },
        nextNode
      );
      const nextMins =
        Math.floor(parseInt(nextNode.time, 10) / 100) * 60 +
        (parseInt(nextNode.time, 10) % 100);
      const availableWindow = nextMins - draftMinutes;
      if (availableWindow < currentLegTravel) {
        timeWarnStr = `Rush Warning: Moving from this draft to the NEXT event at ${nextNode.time} takes ~${currentLegTravel}m, but you only have ${availableWindow}m.`;
      }
    }

    if (prevNode && prevNodeIdx !== -1 && !timeWarnStr) {
      const prevTimeRaw = parseInt(prevNode.time, 10);
      const prevMins = Math.floor(prevTimeRaw / 100) * 60 + (prevTimeRaw % 100);

      if (draftMinutes > prevMins) {
        let prevPredecessor =
          prevNodeIdx > 0 ? sortedExisting[prevNodeIdx - 1] : null;
        if (!prevPredecessor) {
          prevPredecessor = {
            mapId: homeMapId || prevNode.mapId,
            x: homeMapId ? homeX : prevNode.x,
            y: homeMapId ? homeY : prevNode.y,
          };
        }
        const prevLegTravel = calculateDistance(prevPredecessor, prevNode);
        const allowedWindowForPrev = draftMinutes - prevMins;

        if (allowedWindowForPrev < prevLegTravel) {
          timeWarnStr = `Rush Warning: Traveling from the PREVIOUS leg at ${prevNode.time} takes ~${prevLegTravel}m, but you only allowed ${allowedWindowForPrev}m before this node begins.`;
        }
      }
    }

    setTimeWarning(timeWarnStr);
  }, [
    draftTime,
    clickedCoord,
    scheduleNodes,
    homeMapId,
    homeX,
    homeY,
    mapAliases,
    maps,
  ]);

  useEffect(() => {
    const requiredImageNames = new Set();
    Object.values(maps).forEach((map) => {
      map.tilesets.forEach((ts) => {
        requiredImageNames.add(ts.source);
      });
    });

    const filesToLoad = [];
    requiredImageNames.forEach((lowerName) => {
      if (!images[lowerName] && !loadingImagesRef.current.has(lowerName)) {
        const repoKey = Object.keys(assetRepo).find(
          (k) => k.toLowerCase() === lowerName
        );
        if (repoKey) {
          loadingImagesRef.current.add(lowerName);
          filesToLoad.push(assetRepo[repoKey]);
        }
      }
    });

    if (filesToLoad.length > 0) {
      processPngFiles(filesToLoad);
    }
  }, [maps, assetRepo, images]);

  useEffect(() => {
    if (!activeMapId || !maps[activeMapId] || !canvasRef.current) return;

    const map = maps[activeMapId];
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = map.mapData.width * map.mapData.tileWidth;
    canvas.height = map.mapData.height * map.mapData.tileHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    map.layers.forEach((layer) => {
      if (!layer.data || layer.data.length === 0) return;

      layer.data.forEach((tileId, index) => {
        if (tileId === 0) return;

        const flipped_horizontally = (tileId & 0x80000000) !== 0;
        const flipped_vertically = (tileId & 0x40000000) !== 0;
        const flipped_diagonally = (tileId & 0x20000000) !== 0;

        const globalTileId = tileId & ~(0x80000000 | 0x40000000 | 0x20000000);

        if (globalTileId === 0) return;

        let targetTileset = null;
        for (let i = map.tilesets.length - 1; i >= 0; i--) {
          if (globalTileId >= map.tilesets[i].firstgid) {
            targetTileset = map.tilesets[i];
            break;
          }
        }

        if (!targetTileset) return;

        const img = images[targetTileset.source];
        if (!img || img === "FAILED") return;

        const localId = globalTileId - targetTileset.firstgid;
        const columns = Math.floor(img.width / map.mapData.tileWidth);

        const srcX = (localId % columns) * map.mapData.tileWidth;
        const srcY = Math.floor(localId / columns) * map.mapData.tileHeight;
        const destX = (index % map.mapData.width) * map.mapData.tileWidth;
        const destY =
          Math.floor(index / map.mapData.width) * map.mapData.tileHeight;

        ctx.save();
        ctx.translate(
          destX + map.mapData.tileWidth / 2,
          destY + map.mapData.tileHeight / 2
        );

        if (flipped_diagonally) {
          ctx.rotate(Math.PI / 2);
          ctx.scale(flipped_vertically ? -1 : 1, flipped_horizontally ? 1 : -1);
        } else {
          ctx.scale(flipped_horizontally ? -1 : 1, flipped_vertically ? -1 : 1);
        }

        ctx.drawImage(
          img,
          srcX,
          srcY,
          map.mapData.tileWidth,
          map.mapData.tileHeight,
          -map.mapData.tileWidth / 2,
          -map.mapData.tileHeight / 2,
          map.mapData.tileWidth,
          map.mapData.tileHeight
        );
        ctx.restore();
      });
    });

    if (map.mapWarps) {
      map.mapWarps.forEach((portal) => {
        ctx.fillStyle = "rgba(0, 123, 255, 0.4)";
        ctx.fillRect(
          portal.x * map.mapData.tileWidth,
          portal.y * map.mapData.tileHeight,
          map.mapData.tileWidth,
          map.mapData.tileHeight
        );
        ctx.strokeStyle = "#0056b3";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          portal.x * map.mapData.tileWidth,
          portal.y * map.mapData.tileHeight,
          map.mapData.tileWidth,
          map.mapData.tileHeight
        );
      });
    }

    const findPath = (startX, startY, targetX, targetY, mapData) => {
      const width = mapData.mapData.width;
      const height = mapData.mapData.height;
      const collisionLayers = mapData.layers.filter((l) =>
        l.name.toLowerCase().includes("building")
      );

      const isValid = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        if (x === targetX && y === targetY) return true;
        if (x === startX && y === startY) return true;
        for (let layer of collisionLayers) {
          if (layer.data && layer.data[y * width + x] !== 0) return false;
        }
        return true;
      };

      const heuristic = (x, y) => Math.abs(x - targetX) + Math.abs(y - targetY);
      const openSet = [
        {
          x: startX,
          y: startY,
          g: 0,
          f: heuristic(startX, startY),
          parent: null,
        },
      ];
      const closedSet = new Set();
      const coordToKey = (x, y) => `${x},${y}`;

      let iterations = 0;

      while (openSet.length > 0 && iterations < 50000) {
        iterations++;
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();

        if (current.x === targetX && current.y === targetY) {
          const path = [];
          let curr = current;
          while (curr) {
            path.push({ x: curr.x, y: curr.y });
            curr = curr.parent;
          }
          return path.reverse();
        }

        const key = coordToKey(current.x, current.y);
        if (closedSet.has(key)) continue;
        closedSet.add(key);

        const neighbors = [
          { x: current.x, y: current.y - 1 },
          { x: current.x, y: current.y + 1 },
          { x: current.x - 1, y: current.y },
          { x: current.x + 1, y: current.y },
        ];

        for (const n of neighbors) {
          if (isValid(n.x, n.y) && !closedSet.has(coordToKey(n.x, n.y))) {
            const g = current.g + 1;
            const f = g + heuristic(n.x, n.y);
            const existingIdx = openSet.findIndex(
              (o) => o.x === n.x && o.y === n.y
            );
            if (existingIdx !== -1) {
              if (openSet[existingIdx].g > g) {
                openSet[existingIdx] = {
                  x: n.x,
                  y: n.y,
                  g,
                  f,
                  parent: current,
                };
              }
            } else {
              openSet.push({ x: n.x, y: n.y, g, f, parent: current });
            }
          }
        }
      }
      return null;
    };

    if (homeMapId && scheduleNodes.length > 0) {
      const firstNode = scheduleNodes[0];
      const actualHomeMapId = resolveMapId(homeMapId);

      if (actualHomeMapId === activeMapId) {
        ctx.strokeStyle = "rgba(34, 197, 94, 0.6)";
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();

        let targetX = null;
        let targetY = null;

        if (resolveMapId(firstNode.mapId) === activeMapId) {
          targetX = firstNode.x;
          targetY = firstNode.y;
        } else if (map.mapWarps) {
          for (const portal of map.mapWarps) {
            const target = resolveMapId(portal.targetMap);
            if (
              target.toLowerCase() ===
              resolveMapId(firstNode.mapId).toLowerCase()
            ) {
              targetX = portal.x;
              targetY = portal.y;
              break;
            }
          }
        }

        if (targetX !== null && targetY !== null) {
          const path = findPath(homeX, homeY, targetX, targetY, map);
          if (path && path.length > 0) {
            ctx.moveTo(
              (path[0].x + 0.5) * map.mapData.tileWidth,
              (path[0].y + 0.5) * map.mapData.tileHeight
            );
            for (let i = 1; i < path.length; i++) {
              ctx.lineTo(
                (path[i].x + 0.5) * map.mapData.tileWidth,
                (path[i].y + 0.5) * map.mapData.tileHeight
              );
            }
          } else {
            ctx.moveTo(
              (homeX + 0.5) * map.mapData.tileWidth,
              (homeY + 0.5) * map.mapData.tileHeight
            );
            ctx.lineTo(
              (targetX + 0.5) * map.mapData.tileWidth,
              (targetY + 0.5) * map.mapData.tileHeight
            );
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }

    scheduleNodes.forEach((node, idx) => {
      const actualNodeMapId = resolveMapId(node.mapId);
      if (actualNodeMapId !== activeMapId) return;
      const nextNode = scheduleNodes[idx + 1];
      if (!nextNode) return;

      ctx.strokeStyle = "rgba(34, 197, 94, 0.85)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      let targetX = null;
      let targetY = null;
      let isWarp = false;
      const actualNextMapId = resolveMapId(nextNode.mapId);

      if (actualNextMapId === activeMapId) {
        targetX = nextNode.x;
        targetY = nextNode.y;
      } else if (map.mapWarps) {
        for (const portal of map.mapWarps) {
          const target = resolveMapId(portal.targetMap);
          if (target.toLowerCase() === actualNextMapId.toLowerCase()) {
            targetX = portal.x;
            targetY = portal.y;
            isWarp = true;
            break;
          }
        }
      }

      if (targetX !== null && targetY !== null) {
        const path = findPath(node.x, node.y, targetX, targetY, map);
        ctx.beginPath();
        if (path && path.length > 0) {
          ctx.moveTo(
            (path[0].x + 0.5) * map.mapData.tileWidth,
            (path[0].y + 0.5) * map.mapData.tileHeight
          );
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(
              (path[i].x + 0.5) * map.mapData.tileWidth,
              (path[i].y + 0.5) * map.mapData.tileHeight
            );
          }
        } else {
          ctx.moveTo(
            (node.x + 0.5) * map.mapData.tileWidth,
            (node.y + 0.5) * map.mapData.tileHeight
          );
          ctx.lineTo(
            (targetX + 0.5) * map.mapData.tileWidth,
            (targetY + 0.5) * map.mapData.tileHeight
          );
        }
        ctx.stroke();

        if (isWarp) {
          ctx.fillStyle = "#22c55e";
          ctx.beginPath();
          ctx.arc(
            (targetX + 0.5) * map.mapData.tileWidth,
            (targetY + 0.5) * map.mapData.tileHeight,
            4,
            0,
            2 * Math.PI
          );
          ctx.fill();
        }
      }
    });

    if (resolveMapId(homeMapId) === activeMapId) {
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        homeX * map.mapData.tileWidth,
        homeY * map.mapData.tileHeight,
        map.mapData.tileWidth,
        map.mapData.tileHeight
      );
      ctx.fillStyle = "rgba(234, 179, 8, 0.2)";
      ctx.fillRect(
        homeX * map.mapData.tileWidth,
        homeY * map.mapData.tileHeight,
        map.mapData.tileWidth,
        map.mapData.tileHeight
      );

      ctx.fillStyle = "#eab308";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText(
        "HOME",
        homeX * map.mapData.tileWidth + 2,
        homeY * map.mapData.tileHeight + 11
      );
    }

    if (clickedCoord && clickedCoord.mapId === activeMapId) {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      const rectX = clickedCoord.x * map.mapData.tileWidth;
      const rectY = clickedCoord.y * map.mapData.tileHeight;
      ctx.strokeRect(
        rectX,
        rectY,
        map.mapData.tileWidth,
        map.mapData.tileHeight
      );
      ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
      ctx.fillRect(rectX, rectY, map.mapData.tileWidth, map.mapData.tileHeight);
    }
  }, [
    activeMapId,
    maps,
    images,
    clickedCoord,
    scheduleNodes,
    mapAliases,
    homeMapId,
    homeX,
    homeY,
  ]);

  const missingImages = useMemo(() => {
    if (!activeMap) return [];
    const requiredImages = activeMap.tilesets.map((ts) => ts.source);
    return [...new Set(requiredImages.filter((img) => !images[img]))];
  }, [activeMap, images]);

  const repoMapFiles = useMemo(() => {
    return Object.keys(assetRepo).filter(
      (name) => name.endsWith(".tmx") && !maps[name.replace(/\.tmx$/i, "")]
    );
  }, [assetRepo, maps]);

  const allAvailableMaps = useMemo(() => {
    return [...Object.keys(maps).map((m) => m + ".tmx"), ...repoMapFiles];
  }, [maps, repoMapFiles]);

  const filteredLoadedMaps = useMemo(() => {
    return Object.keys(maps).filter((mapId) =>
      mapId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [maps, searchTerm]);

  const filteredRepoMaps = useMemo(() => {
    return repoMapFiles.filter((filename) =>
      filename.toLowerCase().includes(repoSearchTerm.toLowerCase())
    );
  }, [repoMapFiles, repoSearchTerm]);

  return (
    <div
      style={{
        display: "flex",
        gap: "20px",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        padding: "16px",
        boxSizing: "border-box",
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        transition: "all 0.2s ease",
        overflow: "hidden",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {unresolvedWarp && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: theme.panelBg,
              color: theme.text,
              padding: "25px",
              borderRadius: "8px",
              width: "400px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
              border: `1px solid ${theme.border}`,
            }}
          >
            <h3 style={{ marginTop: 0, color: theme.dangerText }}>
              Warp Target Not Found
            </h3>
            <p>
              This tile warps to an internal location named{" "}
              <strong>"{unresolvedWarp}"</strong>, but no `.tmx` file with that
              exact name exists in your loaded files or repository.
            </p>
            <p>Please select the actual file that represents this location:</p>
            <select
              id="warp-resolver-select"
              style={{
                width: "100%",
                padding: "8px",
                marginBottom: "20px",
                fontSize: "1em",
                backgroundColor: theme.inputBg,
                color: theme.text,
                border: `1px solid ${theme.inputBorder}`,
              }}
            >
              <option value="">Select the correct map...</option>
              {allAvailableMaps.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setUnresolvedWarp(null)}
                style={{
                  padding: "8px 15px",
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const sel = document.getElementById(
                    "warp-resolver-select"
                  ).value;
                  if (sel) handleResolveWarp(sel);
                }}
                style={{
                  padding: "8px 15px",
                  backgroundColor: theme.accent,
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Link Map
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          border: `1px solid ${theme.border}`,
          borderRadius: "8px",
          backgroundColor: "#000000",
          overflow: "hidden",
          boxShadow: "inset 0 4px 12px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            backgroundColor: theme.panelBg,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.4em", fontWeight: "800" }}>
              {activeMap ? activeMap.id : "No Map Loaded"}
            </h1>
            {activeMap && (
              <span
                style={{ fontSize: "0.85em", opacity: 0.6, fontWeight: "500" }}
              >
                Double click blue squares to jump maps | Hold Shift + Scroll to
                Zoom
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {activeMap && (
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  marginRight: "16px",
                  backgroundColor: theme.inputBg,
                  padding: "4px",
                  borderRadius: "6px",
                  border: `1px solid ${theme.border}`,
                }}
              >
                <button
                  onClick={() =>
                    setZoomLevel((prev) => Math.max(0.2, prev - 0.2))
                  }
                  style={{
                    background: theme.panelBg,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                    padding: "4px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  -
                </button>
                <span
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.85em",
                    minWidth: "40px",
                    textAlign: "center",
                  }}
                >
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() =>
                    setZoomLevel((prev) => Math.min(5, prev + 0.2))
                  }
                  style={{
                    background: theme.panelBg,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                    padding: "4px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  +
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  style={{
                    background: theme.panelBg,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                    padding: "4px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.85em",
                  }}
                >
                  Reset
                </button>
              </div>
            )}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                cursor: "pointer",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.85em",
                fontWeight: "500",
              }}
            >
              {isDarkMode ? "Change to Light Mode" : " Change to Dark Mode"}
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            position: "relative",
          }}
          onWheel={(e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
              setZoomLevel((prev) =>
                Math.max(0.2, Math.min(prev + (e.deltaY < 0 ? 0.1 : -0.1), 5))
              );
            }
          }}
        >
          {activeMap ? (
            <div
              style={{
                position: "relative",
                cursor: "crosshair",
                padding: "40px",
              }}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
            >
              <canvas
                ref={canvasRef}
                style={{
                  display: "block",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                opacity: 0.4,
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "1.1em", fontWeight: "500" }}>
                Drag and drop files to begin, or use the Workspace tab.
              </p>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          width: "420px",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          backgroundColor: theme.panelBg,
          border: `1px solid ${theme.border}`,
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            backgroundColor: theme.tabBg,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <button
            onClick={() => setActiveTab("workspace")}
            style={{
              flex: 1,
              padding: "12px 0",
              border: "none",
              background:
                activeTab === "workspace" ? theme.panelBg : "transparent",
              color: activeTab === "workspace" ? theme.tabActive : theme.text,
              fontWeight: activeTab === "workspace" ? "700" : "500",
              cursor: "pointer",
              borderBottom:
                activeTab === "workspace"
                  ? `2px solid ${theme.tabActive}`
                  : "2px solid transparent",
              fontSize: "0.9em",
            }}
          >
            Workspace
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            style={{
              flex: 1,
              padding: "12px 0",
              border: "none",
              background:
                activeTab === "timeline" ? theme.panelBg : "transparent",
              color: activeTab === "timeline" ? theme.tabActive : theme.text,
              fontWeight: activeTab === "timeline" ? "700" : "500",
              cursor: "pointer",
              borderBottom:
                activeTab === "timeline"
                  ? `2px solid ${theme.tabActive}`
                  : "2px solid transparent",
              fontSize: "0.9em",
            }}
          >
            Timeline
          </button>
          <button
            onClick={() => setActiveTab("export")}
            style={{
              flex: 1,
              padding: "12px 0",
              border: "none",
              background:
                activeTab === "export" ? theme.panelBg : "transparent",
              color: activeTab === "export" ? theme.tabActive : theme.text,
              fontWeight: activeTab === "export" ? "700" : "500",
              cursor: "pointer",
              borderBottom:
                activeTab === "export"
                  ? `2px solid ${theme.tabActive}`
                  : "2px solid transparent",
              fontSize: "0.9em",
            }}
          >
            Export
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {activeTab === "workspace" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div
                style={{
                  border: isDragging
                    ? `2px dashed ${theme.accent}`
                    : `2px dashed ${theme.border}`,
                  backgroundColor: isDragging
                    ? isDarkMode
                      ? "#0d2a4a"
                      : "#e9f5ff"
                    : theme.bg,
                  padding: "20px",
                  textAlign: "center",
                  borderRadius: "8px",
                }}
              >
                <p
                  style={{
                    margin: "0 0 5px 0",
                    fontWeight: "bold",
                    fontSize: "0.9em",
                  }}
                >
                  Asset Upload
                </p>
                <p style={{ margin: 0, fontSize: "0.8em", opacity: 0.7 }}>
                  Drop files or folders here. All .tmx and .png files in those
                  folders will be added as resources for this tool instance.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginTop: "12px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "0.8em",
                      backgroundColor: theme.inputBg,
                      padding: "6px",
                      borderRadius: "4px",
                      border: `1px solid ${theme.inputBorder}`,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="file"
                      accept=".tmx, image/png"
                      multiple
                      onChange={handleFileDropOrSelect}
                      style={{ display: "none" }}
                    />
                    Browse for single file
                  </label>
                  <label
                    style={{
                      fontSize: "0.8em",
                      backgroundColor: theme.inputBg,
                      padding: "6px",
                      borderRadius: "4px",
                      border: `1px solid ${theme.inputBorder}`,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="file"
                      webkitdirectory="true"
                      directory="true"
                      multiple
                      onChange={handleFolderSelect}
                      style={{ display: "none" }}
                    />
                    Browse to add folder
                  </label>
                </div>
              </div>

              <div
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: "8px",
                  padding: "12px",
                  backgroundColor: theme.bg,
                }}
              >
                <strong
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "0.9em",
                  }}
                >
                  Location Name Config
                </strong>
                <p
                  style={{
                    fontSize: "0.8em",
                    opacity: 0.8,
                    margin: "0 0 10px 0",
                  }}
                >
                  Link asset names with in game location names if they are not
                  the same.
                </p>
                <div
                  style={{ display: "flex", gap: "6px", marginBottom: "10px" }}
                >
                  <input
                    type="text"
                    placeholder="Internal Name"
                    value={aliasInternal}
                    onChange={(e) => setAliasInternal(e.target.value)}
                    style={{
                      flex: 1,
                      width: 0,
                      padding: "6px",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.inputBorder}`,
                      borderRadius: "4px",
                      fontSize: "0.8em",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="File Name"
                    value={aliasFile}
                    onChange={(e) => setAliasFile(e.target.value)}
                    style={{
                      flex: 1,
                      width: 0,
                      padding: "6px",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.inputBorder}`,
                      borderRadius: "4px",
                      fontSize: "0.8em",
                    }}
                  />
                  <button
                    onClick={addAlias}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: theme.accent,
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.8em",
                      fontWeight: "bold",
                    }}
                  >
                    Add
                  </button>
                </div>
                {Object.keys(mapAliases).length > 0 && (
                  <div
                    style={{
                      maxHeight: "100px",
                      overflowY: "auto",
                      backgroundColor: theme.inputBg,
                      border: `1px solid ${theme.inputBorder}`,
                      borderRadius: "4px",
                      padding: "4px",
                    }}
                  >
                    {Object.entries(mapAliases).map(([internal, file]) => (
                      <div
                        key={internal}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8em",
                          padding: "4px",
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                      >
                        <span>
                          <strong>{internal}</strong> - {file}
                        </span>
                        <button
                          onClick={() => {
                            const newAl = { ...mapAliases };
                            delete newAl[internal];
                            setMapAliases(newAl);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: theme.dangerText,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <strong
                  style={{
                    display: "block",
                    fontSize: "0.9em",
                    marginBottom: "8px",
                  }}
                >
                  Import existing schedule
                </strong>
                <textarea
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder={`{\n  "spring": "0900 Custom_Town 10 10 2..."\n}`}
                  style={{
                    width: "100%",
                    height: "80px",
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                    border: `1px solid ${theme.inputBorder}`,
                    borderRadius: "4px",
                    fontSize: "0.85em",
                    padding: "8px",
                    resize: "none",
                    fontFamily: "monospace",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={handleImportSchedule}
                  style={{
                    width: "100%",
                    padding: "8px",
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.85em",
                    fontWeight: "bold",
                    marginTop: "6px",
                  }}
                >
                  Import
                </button>
              </div>

              <div>
                <strong
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: "0.9em",
                    paddingBottom: "4px",
                  }}
                >
                  Loaded Maps
                </strong>
                <input
                  type="text"
                  placeholder="Search maps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    marginBottom: "10px",
                    boxSizing: "border-box",
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                    border: `1px solid ${theme.inputBorder}`,
                    borderRadius: "4px",
                    fontSize: "0.85em",
                  }}
                />
                <ul
                  style={{
                    listStyleType: "none",
                    padding: 0,
                    margin: 0,
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  {filteredLoadedMaps.map((mapId) => (
                    <li key={mapId} style={{ marginBottom: "4px" }}>
                      <button
                        onClick={() => setActiveMapId(mapId)}
                        style={{
                          fontWeight: activeMapId === mapId ? "bold" : "normal",
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 10px",
                          backgroundColor:
                            activeMapId === mapId
                              ? isDarkMode
                                ? "#0d2a4a"
                                : "#e9f5ff"
                              : theme.bg,
                          color:
                            activeMapId === mapId ? theme.accent : theme.text,
                          border: `1px solid ${
                            activeMapId === mapId ? theme.accent : theme.border
                          }`,
                          borderRadius: "4px",
                          fontSize: "0.85em",
                          cursor: "pointer",
                        }}
                      >
                        {mapId}
                      </button>
                    </li>
                  ))}
                  {Object.keys(maps).length === 0 && (
                    <li
                      style={{
                        fontSize: "0.85em",
                        opacity: 0.6,
                        textAlign: "center",
                        padding: "10px 0",
                      }}
                    >
                      No maps loaded.
                    </li>
                  )}
                </ul>
              </div>

              {repoMapFiles.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <strong
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      borderBottom: `1px solid ${theme.border}`,
                      fontSize: "0.85em",
                      paddingBottom: "4px",
                    }}
                  >
                    Available Maps
                  </strong>
                  <input
                    type="text"
                    placeholder="Search repo maps..."
                    value={repoSearchTerm}
                    onChange={(e) => setRepoSearchTerm(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      marginBottom: "8px",
                      boxSizing: "border-box",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.inputBorder}`,
                      borderRadius: "4px",
                      fontSize: "0.85em",
                    }}
                  />
                  <div style={{ maxHeight: "120px", overflowY: "auto" }}>
                    <ul
                      style={{ listStyleType: "none", padding: 0, margin: 0 }}
                    >
                      {filteredRepoMaps.map((filename) => (
                        <li key={filename} style={{ marginBottom: "6px" }}>
                          <button
                            onClick={() =>
                              processTmxFiles([assetRepo[filename]])
                            }
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "6px 10px",
                              fontSize: "0.85em",
                              backgroundColor: theme.panelBg,
                              color: theme.text,
                              border: `1px solid ${theme.border}`,
                              borderRadius: "4px",
                              cursor: "pointer",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            + Load {filename}
                          </button>
                        </li>
                      ))}
                      {filteredRepoMaps.length === 0 && (
                        <li
                          style={{
                            fontSize: "0.85em",
                            opacity: 0.6,
                            textAlign: "center",
                            padding: "10px 0",
                          }}
                        >
                          No matching maps found.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div
                style={{
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "6px",
                  padding: "12px",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8em",
                    fontWeight: "700",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                  }}
                >
                  NPC Home Location
                </span>
                <div
                  style={{ display: "flex", gap: "6px", alignItems: "center" }}
                >
                  <input
                    type="text"
                    placeholder="Map ID"
                    value={homeMapId}
                    onChange={(e) => setHomeMapId(e.target.value)}
                    style={{
                      flex: 2,
                      width: 0,
                      padding: "6px",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.inputBorder}`,
                      borderRadius: "4px",
                      fontSize: "0.85em",
                      fontFamily: "monospace",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="X"
                    value={homeX}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHomeX(
                        v === "" || v === "-" ? v : parseInt(v, 10) || 0
                      );
                    }}
                    style={{
                      flex: 1,
                      width: 0,
                      padding: "6px",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.inputBorder}`,
                      borderRadius: "4px",
                      fontSize: "0.85em",
                      fontFamily: "monospace",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Y"
                    value={homeY}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHomeY(
                        v === "" || v === "-" ? v : parseInt(v, 10) || 0
                      );
                    }}
                    style={{
                      flex: 1,
                      width: 0,
                      padding: "6px",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.inputBorder}`,
                      borderRadius: "4px",
                      fontSize: "0.85em",
                      fontFamily: "monospace",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (clickedCoord) {
                        setHomeMapId(clickedCoord.mapId);
                        setHomeX(clickedCoord.x);
                        setHomeY(clickedCoord.y);
                      } else {
                        alert("Select a map coordinate tile first.");
                      }
                    }}
                    style={{
                      padding: "6px 10px",
                      backgroundColor: theme.accent,
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.8em",
                      fontWeight: "600",
                    }}
                  >
                    Map
                  </button>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "6px",
                  padding: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.8em",
                        fontWeight: "700",
                        marginBottom: "4px",
                      }}
                    >
                      Schedule ID
                    </span>
                    <select
                      value={activeScheduleKey}
                      onChange={(e) => setActiveScheduleKey(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px",
                        backgroundColor: theme.inputBg,
                        color: theme.text,
                        border: `1px solid ${theme.inputBorder}`,
                        borderRadius: "4px",
                        fontSize: "0.85em",
                      }}
                    >
                      {Object.keys(schedules).map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, display: "flex", gap: "4px" }}>
                    <input
                      type="text"
                      placeholder="New ID..."
                      value={newScheduleInput}
                      onChange={(e) => setNewScheduleInput(e.target.value)}
                      style={{
                        flex: 1,
                        width: 0,
                        padding: "6px",
                        backgroundColor: theme.inputBg,
                        color: theme.text,
                        border: `1px solid ${theme.inputBorder}`,
                        borderRadius: "4px",
                        fontSize: "0.85em",
                      }}
                    />
                    <button
                      onClick={handleCreateScheduleKey}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: theme.accent,
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.85em",
                        fontWeight: "600",
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: `1px solid ${theme.accent}`,
                  padding: "14px",
                  borderRadius: "6px",
                  backgroundColor: isDarkMode ? "#0d1b2a" : "#eff6ff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <strong style={{ fontSize: "0.9em" }}>
                    Add Schedule leg
                  </strong>
                  {clickedCoord ? (
                    <span
                      style={{
                        fontSize: "0.75em",
                        backgroundColor: theme.inputBg,
                        padding: "3px 6px",
                        borderRadius: "4px",
                        fontFamily: "monospace",
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      {clickedCoord.mapId} ({clickedCoord.x}, {clickedCoord.y})
                    </span>
                  ) : (
                    <span
                      style={{ fontSize: "0.75em", color: theme.dangerText }}
                    >
                      Click map to target
                    </span>
                  )}
                </div>

                {tileWarning && (
                  <div
                    style={{
                      marginBottom: "10px",
                      padding: "8px",
                      backgroundColor: theme.dangerBg,
                      border: `1px solid ${theme.dangerBorder}`,
                      color: theme.dangerText,
                      fontSize: "0.8em",
                      borderRadius: "4px",
                    }}
                  >
                    {tileWarning}
                  </div>
                )}
                {timeWarning && (
                  <div
                    style={{
                      marginBottom: "10px",
                      padding: "8px",
                      backgroundColor: theme.warningBg,
                      border: `1px solid ${theme.warningBorder}`,
                      color: theme.warningText,
                      fontSize: "0.8em",
                      borderRadius: "4px",
                    }}
                  >
                    {timeWarning}
                  </div>
                )}

                <div
                  style={{ display: "flex", gap: "10px", marginBottom: "10px" }}
                >
                  <label style={{ width: "80px" }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.75em",
                        fontWeight: "700",
                        marginBottom: "4px",
                      }}
                    >
                      Time
                    </span>
                    <input
                      type="text"
                      value={draftTime}
                      onChange={(e) => setDraftTime(e.target.value)}
                      onBlur={handleTimeBlur}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        backgroundColor: theme.inputBg,
                        color: theme.text,
                        border: `1px solid ${theme.inputBorder}`,
                        padding: "6px",
                        borderRadius: "4px",
                        fontSize: "0.85em",
                        textAlign: "center",
                      }}
                    />
                  </label>
                  <label style={{ width: "100px" }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.75em",
                        fontWeight: "700",
                        marginBottom: "4px",
                      }}
                    >
                      Facing
                    </span>
                    <select
                      value={draftDirection}
                      onChange={(e) => setDraftDirection(e.target.value)}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        backgroundColor: theme.inputBg,
                        color: theme.text,
                        border: `1px solid ${theme.inputBorder}`,
                        padding: "6px",
                        borderRadius: "4px",
                        fontSize: "0.85em",
                      }}
                    >
                      <option value="0">0 - Up</option>
                      <option value="1">1 - Right</option>
                      <option value="2">2 - Down</option>
                      <option value="3">3 - Left</option>
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.75em",
                        fontWeight: "700",
                        marginBottom: "4px",
                      }}
                    >
                      Animation (Optional)
                    </span>
                    <input
                      type="text"
                      value={draftAnimation}
                      onChange={(e) => setDraftAnimation(e.target.value)}
                      placeholder="e.g. sit"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        backgroundColor: theme.inputBg,
                        color: theme.text,
                        border: `1px solid ${theme.inputBorder}`,
                        padding: "6px",
                        borderRadius: "4px",
                        fontSize: "0.85em",
                      }}
                    />
                  </label>
                </div>

                <label style={{ display: "block", marginBottom: "12px" }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.75em",
                      fontWeight: "700",
                      marginBottom: "4px",
                    }}
                  >
                    Location specific dialogue (optional)
                  </span>
                  <input
                    type="text"
                    value={draftDialogue}
                    onChange={(e) => setDraftDialogue(e.target.value)}
                    placeholder="Dialogue string..."
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.inputBorder}`,
                      padding: "6px",
                      borderRadius: "4px",
                      fontSize: "0.85em",
                    }}
                  />
                </label>

                <button
                  onClick={addScheduleNode}
                  disabled={!clickedCoord}
                  style={{
                    width: "100%",
                    padding: "8px",
                    backgroundColor: clickedCoord ? theme.accent : theme.border,
                    color: clickedCoord ? "white" : theme.text,
                    border: "none",
                    borderRadius: "4px",
                    cursor: clickedCoord ? "pointer" : "not-allowed",
                    fontSize: "0.9em",
                    fontWeight: "bold",
                  }}
                >
                  Add
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: "200px",
                  border: `1px solid ${theme.border}`,
                  borderRadius: "6px",
                  padding: "10px",
                  backgroundColor: theme.bg,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <strong
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "0.9em",
                  }}
                >
                  Schedule
                </strong>
                <div
                  style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}
                >
                  {scheduleNodes.length === 0 && (
                    <div
                      style={{
                        opacity: 0.5,
                        fontSize: "0.85em",
                        textAlign: "center",
                        marginTop: "20px",
                      }}
                    >
                      No schedule yet
                    </div>
                  )}
                  {scheduleNodes.map((node, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px",
                        borderBottom: `1px solid ${theme.border}`,
                        fontSize: "0.85em",
                        position: "relative",
                        backgroundColor: theme.panelBg,
                        borderRadius: "4px",
                        marginBottom: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          marginBottom: "6px",
                          paddingRight: "40px",
                        }}
                      >
                        <input
                          type="text"
                          value={node.time}
                          onChange={(e) =>
                            updateScheduleNode(idx, "time", e.target.value)
                          }
                          style={{
                            width: "45px",
                            padding: "4px",
                            backgroundColor: theme.inputBg,
                            color: theme.text,
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: "4px",
                          }}
                        />
                        <input
                          type="text"
                          value={node.mapId}
                          onChange={(e) =>
                            updateScheduleNode(idx, "mapId", e.target.value)
                          }
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "4px",
                            backgroundColor: theme.inputBg,
                            color: theme.text,
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: "4px",
                          }}
                        />
                        <input
                          type="text"
                          value={node.x}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateScheduleNode(
                              idx,
                              "x",
                              v === "" || v === "-" ? v : parseInt(v, 10) || 0
                            );
                          }}
                          style={{
                            width: "40px",
                            padding: "4px",
                            backgroundColor: theme.inputBg,
                            color: theme.text,
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: "4px",
                          }}
                        />
                        <input
                          type="text"
                          value={node.y}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateScheduleNode(
                              idx,
                              "y",
                              v === "" || v === "-" ? v : parseInt(v, 10) || 0
                            );
                          }}
                          style={{
                            width: "40px",
                            padding: "4px",
                            backgroundColor: theme.inputBg,
                            color: theme.text,
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: "4px",
                          }}
                        />
                        <select
                          value={node.direction}
                          onChange={(e) =>
                            updateScheduleNode(idx, "direction", e.target.value)
                          }
                          style={{
                            width: "65px",
                            padding: "4px",
                            backgroundColor: theme.inputBg,
                            color: theme.text,
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: "4px",
                          }}
                        >
                          <option value="0">Up</option>
                          <option value="1">Right</option>
                          <option value="2">Down</option>
                          <option value="3">Left</option>
                        </select>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          paddingRight: "40px",
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Animation"
                          value={node.animation}
                          onChange={(e) =>
                            updateScheduleNode(idx, "animation", e.target.value)
                          }
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "4px",
                            backgroundColor: theme.inputBg,
                            color: theme.text,
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: "4px",
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Dialogue"
                          value={node.dialogue}
                          onChange={(e) =>
                            updateScheduleNode(idx, "dialogue", e.target.value)
                          }
                          style={{
                            flex: 2,
                            minWidth: 0,
                            padding: "4px",
                            backgroundColor: theme.inputBg,
                            color: theme.text,
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          color: theme.successText,
                          fontWeight: "bold",
                          textAlign: "right",
                          paddingRight: "40px",
                        }}
                      >
                        {getArrivalEstimate(idx)}
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          top: "6px",
                          right: "6px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <button
                          onClick={() => removeScheduleNode(idx)}
                          style={{
                            background: "none",
                            border: "none",
                            color: theme.dangerText,
                            cursor: "pointer",
                            fontSize: "1.2em",
                            padding: 0,
                            lineHeight: 1,
                            marginBottom: "4px",
                          }}
                        >
                          X
                        </button>
                        <button
                          onClick={() => moveScheduleNode(idx, -1)}
                          disabled={idx === 0}
                          style={{
                            background: theme.inputBg,
                            border: `1px solid ${theme.border}`,
                            color: theme.text,
                            cursor: idx === 0 ? "not-allowed" : "pointer",
                            padding: "2px",
                            borderRadius: "2px",
                            fontSize: "0.8em",
                            opacity: idx === 0 ? 0.3 : 1,
                          }}
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveScheduleNode(idx, 1)}
                          disabled={idx === scheduleNodes.length - 1}
                          style={{
                            background: theme.inputBg,
                            border: `1px solid ${theme.border}`,
                            color: theme.text,
                            cursor:
                              idx === scheduleNodes.length - 1
                                ? "not-allowed"
                                : "pointer",
                            padding: "2px",
                            borderRadius: "2px",
                            fontSize: "0.8em",
                            opacity: idx === scheduleNodes.length - 1 ? 0.3 : 1,
                          }}
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "export" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div
                style={{
                  backgroundColor: theme.panelBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "6px",
                  padding: "16px",
                }}
              >
                <h3 style={{ margin: "0 0 10px 0", fontSize: "1em" }}>
                  Project Configuration File
                </h3>
                <p
                  style={{
                    fontSize: "0.85em",
                    opacity: 0.8,
                    marginBottom: "14px",
                    lineHeight: "1.4",
                  }}
                >
                  Save some settings to allow you to come back without having to
                  set everything up again.
                </p>
                <button
                  onClick={exportProjectConfig}
                  style={{
                    width: "100%",
                    padding: "10px",
                    backgroundColor: theme.accent,
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    marginBottom: "10px",
                  }}
                >
                  Download Project JSON
                </button>
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <strong style={{ fontSize: "0.9em" }}>Schedule JSON</strong>
                  <button
                    onClick={() => copyToClipboard(generatedFullScheduleJSON)}
                    style={{
                      fontSize: "0.75em",
                      padding: "4px 8px",
                      cursor: "pointer",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                      borderRadius: "4px",
                    }}
                  >
                    Copy
                  </button>
                </div>
                <textarea
                  readOnly
                  value={generatedFullScheduleJSON}
                  style={{
                    width: "100%",
                    height: "150px",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                    fontSize: "0.85em",
                    padding: "8px",
                    resize: "none",
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                    border: `1px solid ${theme.inputBorder}`,
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <strong style={{ fontSize: "0.9em" }}>Dialogue Code</strong>
                  <button
                    onClick={() => copyToClipboard(generatedDialogueString)}
                    style={{
                      fontSize: "0.75em",
                      padding: "4px 8px",
                      cursor: "pointer",
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                      borderRadius: "4px",
                    }}
                  >
                    Copy
                  </button>
                </div>
                <textarea
                  readOnly
                  value={generatedDialogueString}
                  style={{
                    width: "100%",
                    height: "100px",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                    fontSize: "0.85em",
                    padding: "8px",
                    resize: "none",
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                    border: `1px solid ${theme.inputBorder}`,
                    borderRadius: "4px",
                  }}
                  placeholder="Dialogue configurations will compile here."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TmxUploader;
