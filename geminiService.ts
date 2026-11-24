
import { GoogleGenAI, Type } from "@google/genai";
import { SearchResult, AdvancedFilters } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const searchPublicStorage = async (
  query: string, 
  category: string, 
  filters: AdvancedFilters,
  isUrlLookup: boolean = false
): Promise<SearchResult[]> => {
  try {
    const model = 'gemini-3-flash-preview';
    const isFoldersOnly = category === 'Folders';

    const systemInstruction = `
      You are a specialized search assistant for public storage links on:
      MediaFire, Google Drive, Mega.nz, Dropbox, 4Shared, OneDrive, Proton Drive, Yandex Disk, GoFile, FileGarden, TeraBox (terabox.com), Box (box.com), Pixeldrain (pixeldrain.com), and WorkUpload (workupload.com).
      
      ${isUrlLookup ? 
        "The user has provided a DIRECT URL. Your primary goal is to verify this specific link, extract its metadata (title, size, type, date), and find any related mirrors or public information about this specific file." : 
        `Your goal is to find valid, public shared ${isFoldersOnly ? 'FOLDERS and DIRECTORIES' : 'files and folders'} based on the user's keywords and specific filters.`
      }

      ${isFoldersOnly ? 'CRITICAL: Only return links that point to directory or folder structures, not individual files.' : ''}

      Always prioritize direct links:
      - MediaFire: mediafire.com/file/... or mediafire.com/folder/...
      - Google Drive: drive.google.com/file/d/... or drive.google.com/drive/folders/...
      - Mega: mega.nz/file/... or mega.nz/folder/...
      - Dropbox: dropbox.com/s/... or dropbox.com/sh/...
      - 4Shared: 4shared.com/file/... or 4shared.com/folder/...
      - OneDrive: onedrive.live.com/redir?resid=...
      - Proton Drive: drive.proton.me/urls/...
      - Yandex Disk: disk.yandex.com/d/...
      - GoFile: gofile.io/d/...
      - FileGarden: filegarden.com/...
      - TeraBox: terabox.com/s/... or terabox.app/s/...
      - Box: app.box.com/s/...
      - Pixeldrain: pixeldrain.com/u/...
      - WorkUpload: workupload.com/file/...

      Return a list of results with their title, a brief snippet, verified URL, the platform name EXACTLY as specified in the schema, estimated fileSize, and uploadDate if possible.
      Strictly adhere to the user's requested filters for file types, size ranges, and timeframes.
    `;

    const filterString = `
      Target Category: ${category}
      File Type Constraint: ${filters.fileType}
      Size Range: ${filters.sizeRange}
      Upload Date: ${filters.uploadDate}
      Sort By: ${filters.sortBy}
    `;

    const folderOperators = isFoldersOnly ? ' (inurl:folder OR inurl:shared OR inurl:drive/folders OR inurl:mediafire.com/folder OR inurl:terabox.com/s/)' : '';

    const prompt = isUrlLookup 
      ? `Perform a deep metadata lookup for this specific public link: "${query}". Provide the file details and check if it is still active.`
      : `Search for public cloud storage files matching: "${query}"${folderOperators}. 
    Additional context: ${filterString}. 
    Target platforms: MediaFire, Drive, Mega, Dropbox, 4Shared, OneDrive, Proton, Yandex, GoFile, FileGarden, TeraBox, Box, Pixeldrain, WorkUpload.`;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  snippet: { type: Type.STRING },
                  url: { type: Type.STRING },
                  platform: { 
                    type: Type.STRING,
                    description: "Must be exactly 'MediaFire', 'Google Drive', 'Mega', 'Dropbox', '4Shared', 'OneDrive', 'Proton Drive', 'Yandex Disk', 'GoFile', 'FileGarden', 'TeraBox', 'Box', 'Pixeldrain', or 'WorkUpload'"
                  },
                  fileType: { type: Type.STRING },
                  fileSize: { type: Type.STRING },
                  uploadDate: { type: Type.STRING }
                },
                required: ["title", "snippet", "url", "platform"]
              }
            }
          },
          required: ["results"]
        }
      }
    });

    const data = JSON.parse(response.text || '{"results": []}');
    return data.results || [];
  } catch (error) {
    console.error("Search failed:", error);
    throw new Error("Unable to fetch results. Try refining your keywords.");
  }
};

export const resolveDirectLink = async (url: string): Promise<{ directUrl: string; title: string; explanation: string }> => {
  try {
    const model = 'gemini-3-flash-preview';
    const response = await ai.models.generateContent({
      model: model,
      contents: `Resolve the direct download link for this shared storage URL: "${url}". 
      If it's Google Drive, convert to a direct /uc?export=download path. 
      If it's Dropbox, change dl=0 to dl=1. 
      If it's Pixeldrain, use /api/file/{id}?download.
      If it's TeraBox or Box, find the actual download endpoint via grounding.
      Return the direct URL, a likely file title, and a brief explanation.`,
      config: {
        systemInstruction: "You are a direct download link resolver. You help users bypass intermediate landing pages for cloud storage services when possible.",
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            directUrl: { type: Type.STRING },
            title: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["directUrl", "title", "explanation"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Link resolution failed:", error);
    throw new Error("Could not generate a direct download link for this URL.");
  }
};
