import path from 'path';
import { uuid } from 'utils/common';
import find from 'lodash/find';
import map from 'lodash/map';
import forOwn from 'lodash/forOwn';
import concat from 'lodash/concat';
import filter from 'lodash/filter';
import each from 'lodash/each';
import cloneDeep from 'lodash/cloneDeep';
import { createSlice } from '@reduxjs/toolkit';
import splitOnFirst from 'split-on-first';
import {
  findCollectionByUid,
  findItemInCollection,
  findEnvironmentInCollection,
  findItemInCollectionByPathname,
  addDepth,
  collapseCollection,
  deleteItemInCollection,
  deleteItemInCollectionByPathname,
  isItemARequest,
  areItemsTheSameExceptSeqUpdate
} from 'utils/collections';
import { parseQueryParams, stringifyQueryParams } from 'utils/url';
import { getSubdirectoriesFromRoot } from 'utils/common/platform';

const PATH_SEPARATOR = path.sep;

const initialState = {
  collections: []
};

export const collectionsSlice = createSlice({
  name: 'collections',
  initialState,
  reducers: {
    createCollection: (state, action) => {
      const collectionUids = map(state.collections, (c) => c.uid);
      const collection = action.payload;
      collapseCollection(collection);
      addDepth(collection.items);
      if (!collectionUids.includes(collection.uid)) {
        state.collections.push(collection);
      }
    },
    renameCollection: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        collection.name = action.payload.newName;
      }
    },
    removeCollection: (state, action) => {
      state.collections = filter(state.collections, (c) => c.uid !== action.payload.collectionUid);
    },
    addEnvironment: (state, action) => {
      const { environment, collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        collection.environments = collection.environments || [];
        collection.environments.push(environment);
      }
    },
    collectionUnlinkEnvFileEvent: (state, action) => {
      const { data: environment, meta } = action.payload;
      const collection = findCollectionByUid(state.collections, meta.collectionUid);

      if (collection) {
        collection.environments = filter(collection.environments, (e) => e.uid !== environment.uid);
      }
    },
    saveEnvironment: (state, action) => {
      const { variables, environmentUid, collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        const environment = findEnvironmentInCollection(collection, environmentUid);

        if (environment) {
          environment.variables = variables;
        }
      }
    },
    selectEnvironment: (state, action) => {
      const { environmentUid, collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        if (environmentUid) {
          const environment = findEnvironmentInCollection(collection, environmentUid);

          if (environment) {
            collection.activeEnvironmentUid = environmentUid;
          }
        } else {
          collection.activeEnvironmentUid = null;
        }
      }
    },
    newItem: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        if (!action.payload.currentItemUid) {
          collection.items.push(action.payload.item);
        } else {
          const item = findItemInCollection(collection, action.payload.currentItemUid);

          if (item) {
            item.items = item.items || [];
            item.items.push(action.payload.item);
          }
        }
        addDepth(collection.items);
      }
    },
    deleteItem: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        deleteItemInCollection(action.payload.itemUid, collection);
      }
    },
    renameItem: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item) {
          item.name = action.payload.newName;
        }
      }
    },
    cloneItem: (state, action) => {
      const collectionUid = action.payload.collectionUid;
      const clonedItem = action.payload.clonedItem;
      const parentItemUid = action.payload.parentItemUid;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        if (parentItemUid) {
          const parentItem = findItemInCollection(collection, parentItemUid);
          parentItem.items.push(clonedItem);
        } else {
          collection.items.push(clonedItem);
        }
      }
    },
    requestSentEvent: (state, action) => {
      const { itemUid, collectionUid, cancelTokenUid, requestSent } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.requestSent = requestSent
          item.response = item.response || {};
          item.requestState = 'sending';
          item.cancelTokenUid = cancelTokenUid;
        }
      }
    },
    requestQueuedEvent: (state, action) => {
      const { itemUid, collectionUid, cancelTokenUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.requestState = 'queued';
          item.cancelTokenUid = cancelTokenUid;
        }
      }
    },
    scriptEnvironmentUpdateEvent: (state, action) => {
      const { collectionUid, environment } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        const activeEnvironmentUid = collection.activeEnvironmentUid;
        const activeEnvironment = findEnvironmentInCollection(collection, activeEnvironmentUid);

        if (activeEnvironment) {
          forOwn(environment, (value, key) => {
            const variable = find(activeEnvironment.variables, (v) => v.name === key);

            if (variable) {
              variable.value = value;
            }
          });
        }
      }
    },
    requestCancelled: (state, action) => {
      const { itemUid, collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.response = null;
          item.cancelTokenUid = null;
        }
      }
    },
    responseReceived: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);
        if (item) {
          item.requestState = 'received';
          item.response = action.payload.response;
          item.cancelTokenUid = null;
        }
      }
    },
    saveRequest: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && item.draft) {
          item.request = item.draft.request;
          item.draft = null;
        }
      }
    },
    newEphermalHttpRequest: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection && collection.items && collection.items.length) {
        const item = {
          uid: action.payload.uid,
          name: action.payload.requestName,
          type: action.payload.requestType,
          request: {
            url: action.payload.requestUrl,
            method: action.payload.requestMethod,
            params: [],
            headers: [],
            body: {
              mode: null,
              content: null
            }
          },
          draft: null
        };
        item.draft = cloneDeep(item);
        collection.items.push(item);
      }
    },
    collectionClicked: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload);

      if (collection) {
        collection.collapsed = !collection.collapsed;
      }
    },
    collectionFolderClicked: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && item.type === 'folder') {
          item.collapsed = !item.collapsed;
        }
      }
    },
    requestUrlChanged: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.url = action.payload.url;

          const parts = splitOnFirst(item.draft.request.url, '?');
          const urlParams = parseQueryParams(parts[1]);
          const disabledParams = filter(item.draft.request.params, (p) => !p.enabled);
          let enabledParams = filter(item.draft.request.params, (p) => p.enabled);

          // try and connect as much as old params uid's as possible
          each(urlParams, (urlParam) => {
            const existingParam = find(enabledParams, (p) => p.name === urlParam.name || p.value === urlParam.value);
            urlParam.uid = existingParam ? existingParam.uid : uuid();
            urlParam.enabled = true;

            // once found, remove it - trying our best here to accomodate duplicate query params
            if (existingParam) {
              enabledParams = filter(enabledParams, (p) => p.uid !== existingParam.uid);
            }
          });

          // ultimately params get replaced with params in url + the disabled ones that existed prior
          // the query params are the source of truth, the url in the queryurl input gets constructed using these params
          // we however are also storing the full url (with params) in the url itself
          item.draft.request.params = concat(urlParams, disabledParams);
        }
      }
    },
    addQueryParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.params = item.draft.request.params || [];
          item.draft.request.params.push({
            uid: uuid(),
            name: '',
            value: '',
            description: '',
            enabled: true
          });
        }
      }
    },
    updateQueryParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          const param = find(item.draft.request.params, (h) => h.uid === action.payload.param.uid);
          if (param) {
            param.name = action.payload.param.name;
            param.value = action.payload.param.value;
            param.description = action.payload.param.description;
            param.enabled = action.payload.param.enabled;

            // update request url
            const parts = splitOnFirst(item.draft.request.url, '?');
            const query = stringifyQueryParams(filter(item.draft.request.params, (p) => p.enabled));

            // if no query is found, then strip the query params in url
            if (!query || !query.length) {
              if (parts.length) {
                item.draft.request.url = parts[0];
              }
              return;
            }

            // if no parts were found, then append the query
            if (!parts.length) {
              item.draft.request.url += '?' + query;
              return;
            }

            // control reaching here means the request has parts and query is present
            item.draft.request.url = parts[0] + '?' + query;
          }
        }
      }
    },
    deleteQueryParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.params = filter(item.draft.request.params, (p) => p.uid !== action.payload.paramUid);

          // update request url
          const parts = splitOnFirst(item.draft.request.url, '?');
          const query = stringifyQueryParams(filter(item.draft.request.params, (p) => p.enabled));
          if (query && query.length) {
            item.draft.request.url = parts[0] + '?' + query;
          } else {
            item.draft.request.url = parts[0];
          }
        }
      }
    },
    addRequestHeader: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.headers = item.draft.request.headers || [];
          item.draft.request.headers.push({
            uid: uuid(),
            name: '',
            value: '',
            description: '',
            enabled: true
          });
        }
      }
    },
    updateRequestHeader: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          const header = find(item.draft.request.headers, (h) => h.uid === action.payload.header.uid);
          if (header) {
            header.name = action.payload.header.name;
            header.value = action.payload.header.value;
            header.description = action.payload.header.description;
            header.enabled = action.payload.header.enabled;
          }
        }
      }
    },
    deleteRequestHeader: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.headers = filter(item.draft.request.headers, (h) => h.uid !== action.payload.headerUid);
        }
      }
    },
    addFormUrlEncodedParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.body.formUrlEncoded = item.draft.request.body.formUrlEncoded || [];
          item.draft.request.body.formUrlEncoded.push({
            uid: uuid(),
            name: '',
            value: '',
            description: '',
            enabled: true
          });
        }
      }
    },
    updateFormUrlEncodedParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          const param = find(item.draft.request.body.formUrlEncoded, (p) => p.uid === action.payload.param.uid);
          if (param) {
            param.name = action.payload.param.name;
            param.value = action.payload.param.value;
            param.description = action.payload.param.description;
            param.enabled = action.payload.param.enabled;
          }
        }
      }
    },
    deleteFormUrlEncodedParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.body.formUrlEncoded = filter(item.draft.request.body.formUrlEncoded, (p) => p.uid !== action.payload.paramUid);
        }
      }
    },
    addMultipartFormParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.body.multipartForm = item.draft.request.body.multipartForm || [];
          item.draft.request.body.multipartForm.push({
            uid: uuid(),
            name: '',
            value: '',
            description: '',
            enabled: true
          });
        }
      }
    },
    updateMultipartFormParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          const param = find(item.draft.request.body.multipartForm, (p) => p.uid === action.payload.param.uid);
          if (param) {
            param.name = action.payload.param.name;
            param.value = action.payload.param.value;
            param.description = action.payload.param.description;
            param.enabled = action.payload.param.enabled;
          }
        }
      }
    },
    deleteMultipartFormParam: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.body.multipartForm = filter(item.draft.request.body.multipartForm, (p) => p.uid !== action.payload.paramUid);
        }
      }
    },
    updateRequestBodyMode: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.body.mode = action.payload.mode;
        }
      }
    },
    updateRequestBody: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          switch (item.draft.request.body.mode) {
            case 'json': {
              item.draft.request.body.json = action.payload.content;
              break;
            }
            case 'text': {
              item.draft.request.body.text = action.payload.content;
              break;
            }
            case 'xml': {
              item.draft.request.body.xml = action.payload.content;
              break;
            }
            case 'formUrlEncoded': {
              item.draft.request.body.formUrlEncoded = action.payload.content;
              break;
            }
            case 'multipartForm': {
              item.draft.request.body.multipartForm = action.payload.content;
              break;
            }
          }
        }
      }
    },
    updateRequestGraphqlQuery: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.body.mode = 'graphql';
          item.draft.request.body.graphql = item.draft.request.body.graphql || {};
          item.draft.request.body.graphql.query = action.payload.query;
        }
      }
    },
    updateRequestScript: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.script = action.payload.script;
        }
      }
    },
    updateRequestTests: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.tests = action.payload.tests;
        }
      }
    },
    updateRequestMethod: (state, action) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          item.draft.request.method = action.payload.method;
        }
      }
    },
    collectionAddFileEvent: (state, action) => {
      const file = action.payload.file;
      const collection = findCollectionByUid(state.collections, file.meta.collectionUid);

      if (collection) {
        const dirname = path.dirname(file.meta.pathname);
        const subDirectories = getSubdirectoriesFromRoot(collection.pathname, dirname);
        let currentPath = collection.pathname;
        let currentSubItems = collection.items;
        for (const directoryName of subDirectories) {
          let childItem = currentSubItems.find((f) => f.type === 'folder' && f.name === directoryName);
          if (!childItem) {
            childItem = {
              uid: uuid(),
              pathname: `${currentPath}${PATH_SEPARATOR}${directoryName}`,
              name: directoryName,
              collapsed: true,
              type: 'folder',
              items: []
            };
            currentSubItems.push(childItem);
          }

          currentPath = `${currentPath}${PATH_SEPARATOR}${directoryName}`;
          currentSubItems = childItem.items;
        }

        if (!currentSubItems.find((f) => f.name === file.meta.name)) {
          // this happens when you rename a file
          // the add event might get triggered first, before the unlink event
          // this results in duplicate uids causing react renderer to go mad
          const currentItem = find(currentSubItems, (i) => i.uid === file.data.uid);
          if (currentItem) {
            currentItem.name = file.data.name;
            currentItem.type = file.data.type;
            currentItem.seq = file.data.seq;
            currentItem.request = file.data.request;
            currentItem.filename = file.meta.name;
            currentItem.pathname = file.meta.pathname;
            currentItem.draft = null;
          } else {
            currentSubItems.push({
              uid: file.data.uid,
              name: file.data.name,
              type: file.data.type,
              seq: file.data.seq,
              request: file.data.request,
              filename: file.meta.name,
              pathname: file.meta.pathname,
              draft: null
            });
          }
        }
        addDepth(collection.items);
      }
    },
    collectionAddDirectoryEvent: (state, action) => {
      const { dir } = action.payload;
      const collection = findCollectionByUid(state.collections, dir.meta.collectionUid);

      if (collection) {
        const subDirectories = getSubdirectoriesFromRoot(collection.pathname, dir.meta.pathname);
        let currentPath = collection.pathname;
        let currentSubItems = collection.items;
        for (const directoryName of subDirectories) {
          let childItem = currentSubItems.find((f) => f.type === 'folder' && f.name === directoryName);
          if (!childItem) {
            childItem = {
              uid: uuid(),
              pathname: `${currentPath}${PATH_SEPARATOR}${directoryName}`,
              name: directoryName,
              collapsed: true,
              type: 'folder',
              items: []
            };
            currentSubItems.push(childItem);
          }

          currentPath = `${currentPath}${PATH_SEPARATOR}${directoryName}`;
          currentSubItems = childItem.items;
        }
        addDepth(collection.items);
      }
    },
    collectionChangeFileEvent: (state, action) => {
      const { file } = action.payload;
      const collection = findCollectionByUid(state.collections, file.meta.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, file.data.uid);

        if (item) {
          // whenever a user attempts to sort a req within the same folder
          // the seq is updated, but everything else remains the same
          // we don't want to lose the draft in this case
          if(areItemsTheSameExceptSeqUpdate(item, file.data)) {
            item.seq = file.data.seq;
          } else {
            item.name = file.data.name;
            item.type = file.data.type;
            item.seq = file.data.seq;
            item.request = file.data.request;
            item.filename = file.meta.name;
            item.pathname = file.meta.pathname;
            item.draft = null;
          }
        }
      }
    },
    collectionUnlinkFileEvent: (state, action) => {
      const { file } = action.payload;
      const collection = findCollectionByUid(state.collections, file.meta.collectionUid);

      if (collection) {
        const item = findItemInCollectionByPathname(collection, file.meta.pathname);

        if (item) {
          deleteItemInCollectionByPathname(file.meta.pathname, collection);
        }
      }
    },
    collectionUnlinkDirectoryEvent: (state, action) => {
      const { directory } = action.payload;
      const collection = findCollectionByUid(state.collections, directory.meta.collectionUid);

      if (collection) {
        const item = findItemInCollectionByPathname(collection, directory.meta.pathname);

        if (item) {
          deleteItemInCollectionByPathname(directory.meta.pathname, collection);
        }
      }
    },
    collectionAddEnvFileEvent: (state, action) => {
      const { environment, collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        collection.environments = collection.environments || [];

        const existingEnv = collection.environments.find((e) => e.uid === environment.uid);
        
        if (existingEnv) {
          existingEnv.variables = environment.variables;
        } else {
          collection.environments.push(environment);
        }
      }
    },
    testResultsEvent: (state, action) => {
      const { itemUid, collectionUid, results } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, itemUid);

        if (item) {
          item.testResults = results;
        }
      }
    }
  }
});

export const {
  createCollection,
  renameCollection,
  removeCollection,
  addEnvironment,
  collectionUnlinkEnvFileEvent,
  saveEnvironment,
  selectEnvironment,
  newItem,
  deleteItem,
  renameItem,
  cloneItem,
  requestSentEvent,
  requestQueuedEvent,
  scriptEnvironmentUpdateEvent,
  requestCancelled,
  responseReceived,
  saveRequest,
  newEphermalHttpRequest,
  collectionClicked,
  collectionFolderClicked,
  requestUrlChanged,
  addQueryParam,
  updateQueryParam,
  deleteQueryParam,
  addRequestHeader,
  updateRequestHeader,
  deleteRequestHeader,
  addFormUrlEncodedParam,
  updateFormUrlEncodedParam,
  deleteFormUrlEncodedParam,
  addMultipartFormParam,
  updateMultipartFormParam,
  deleteMultipartFormParam,
  updateRequestBodyMode,
  updateRequestBody,
  updateRequestGraphqlQuery,
  updateRequestScript,
  updateRequestTests,
  updateRequestMethod,
  collectionAddFileEvent,
  collectionAddDirectoryEvent,
  collectionChangeFileEvent,
  collectionUnlinkFileEvent,
  collectionUnlinkDirectoryEvent,
  collectionAddEnvFileEvent,
  testResultsEvent
} = collectionsSlice.actions;

export default collectionsSlice.reducer;
