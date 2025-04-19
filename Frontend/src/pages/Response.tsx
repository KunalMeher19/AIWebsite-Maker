import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ListOrdered, Code2, Play, Send } from 'lucide-react';
import { StepsList } from '../components/StepsList';
import { FileExplorer } from '../components/FileExplorer';
import { TabView } from '../components/TabView';
import { CodeEditor } from '../components/CodeEditor';
import { PreviewFrame } from '../components/PreviewFrame';
import { Step, FileItem, StepType } from '../types';
import axios from 'axios';
import { BACKEND_URL } from '../config.ts';
import { parseXml } from '../steps.ts';
import { useWebContainer } from '../hooks/useWebContainer';
import { Loader } from '../components/Loader';

export function Response() {
  const location = useLocation();
  const { prompt } = location.state as { prompt: string };
  const [userPrompt, setPrompt] = useState("");
  const [llmMessages, setLlmMessages] = useState<{ role: "user" | "assistant", content: string; }[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateSet, setTemplateSet] = useState(false);
  const webcontainer = useWebContainer();

  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);

  const [steps, setSteps] = useState<Step[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);


  // Make the steps provided by the LLM into a list of files and folders structure
  useEffect(() => {
    let originalFiles = [...files];
    let updateHappened = false;

    steps
      .filter(({ status }) => status === 'pending')
      .forEach((step) => {
        updateHappened = true;

        if (step?.type === StepType.CreateFile && step.path) {
          let parsedPath = step.path.split('/'); // e.g., ['src', 'components', 'App.tsx']
          let currentFileStructure = [...originalFiles];
          let currentFolderPath = '';
          let finalAnswerRef = currentFileStructure;

          while (parsedPath.length) {
            const currentFolderName = parsedPath[0];
            currentFolderPath = currentFolderPath
              ? `${currentFolderPath}/${currentFolderName}`
              : currentFolderName;
            parsedPath = parsedPath.slice(1);

            if (!parsedPath.length) {
              // This is a file
              const existingFile = currentFileStructure.find(
                (x) => x.path === currentFolderPath
              );
              if (!existingFile) {
                currentFileStructure.push({
                  name: currentFolderName,
                  type: 'file',
                  path: currentFolderPath,
                  content: step.code,
                });
              } else {
                existingFile.content = step.code;
              }
            } else {
              // This is a folder
              let existingFolder = currentFileStructure.find(
                (x) => x.path === currentFolderPath && x.type === 'folder'
              );

              if (!existingFolder) {
                const newFolder: FileItem = {
                  name: currentFolderName,
                  type: 'folder',
                  path: currentFolderPath,
                  children: [],
                };
                currentFileStructure.push(newFolder);
                existingFolder = newFolder;
              }

              currentFileStructure = existingFolder.children!;
            }
          }

          originalFiles = finalAnswerRef;
        }
      });

    if (updateHappened) {
      setFiles(originalFiles);
      setSteps(steps => steps.map((s: Step) => {
        return {
          ...s,
          status: "completed"
        }

      }))
    }
  }, [steps, files]);

  // Mount the files to the WebContainer
  const createMountStructure = (files: FileItem[]): Record<string, any> => {
    const processFile = (file: FileItem): any => {
      if (file.type === 'folder') {
        return {
          directory: file.children
            ? Object.fromEntries(file.children.map(child => [child.name, processFile(child)]))
            : {}
        };
      } else if (file.type === 'file') {
        return {
          file: {
            contents: file.content || ''
          }
        };
      }
    };
  
    return Object.fromEntries(files.map(file => [file.name, processFile(file)]));
  };
  useEffect(() => {
    const mountStructure = createMountStructure(files);
    console.log(mountStructure);
    webcontainer?.mount(mountStructure);
  }, [files, webcontainer]);
  
  // sending the Prompts and updating the status of the steps along the way
  async function init() {
    //
    const response = await axios.post(`${BACKEND_URL}/template`, {
      prompt: prompt.trim()
    });
    setTemplateSet(true);

    const { prompts, uiPrompts } = response.data;

    setSteps(parseXml(uiPrompts[0]).map((x: Step) => ({
      ...x,
      status: "pending"
    })));

    setLoading(true);
    const stepsResponse = await axios.post(`${BACKEND_URL}/chat`, {
      messages: [...prompts, prompt].map(content => ({
        role: "user",
        content
      }))
    })

    setLoading(false);

    setSteps(s => [...s, ...parseXml(stepsResponse.data.response).map(x => ({
      ...x,
      status: "pending" as "pending",
    }))]);

    setLlmMessages([...prompts, prompt].map(content => ({
      role: "user",
      content
    })));

    setLlmMessages(x => [...x, { role: "assistant", content: stepsResponse.data.response }])
  }
  useEffect(() => {
    init();
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.8, ease: 'easeIn' } }}
      exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeIn' } }}
      className="px-2 h-[90vh] w-[100%]"
    >
      <div className="flex gap-6 h-[90vh]">

        {/* Steps Section*/}
        <div className="h-auto gap-1 bg-white/5 rounded-lg p-6 border border-white/10 flex flex-col">
          <div className="flex flex-col h-[90%] overflow-auto scrollbar-hide">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <ListOrdered className="w-5 h-5" />
              Steps
            </h2>
            <div className="space-y-4 overflow-y-auto h-full pr-2">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 1, ease: 'easeIn' } }}
                transition={{ delay: 0.2, transition: { duration: 1, ease: 'easeIn' } }}
                className="flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-sm">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-2">Understanding the request</h3>
                  <p className="text-white/70">First, let's analyze what needs to be done...</p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 1, ease: 'easeIn' } }}
                transition={{ delay: 0.4, transition: { duration: 1, ease: 'easeIn' } }}
                className="flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-sm">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-2">Implementation steps</h3>
                  <p className="text-white/70">Here's how we'll implement the solution...</p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 1, ease: 'easeIn' } }}
                transition={{ delay: 0.4, transition: { duration: 1, ease: 'easeIn' } }}
                className="flex items-start gap-3"
              >
                <p className="text-white/70 flex-1 items-center justify-center text-sm overflow-hidden ">
                  <StepsList
                    steps={steps}
                    currentStep={currentStep}
                    onStepClick={setCurrentStep}
                  />
                </p>
              </motion.div>
            </div>
          </div>

          {/* Instruction Input */}
          <div className="h-10% w-100% pt-4 border-t border-white/10 flex">
            {(loading || !templateSet) && <form className="relative flex flex-row">
              <input
                type="text"
                value={userPrompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                }}
                placeholder="Add more instructions..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
              <button
                className="absolute -top-2 right-3"
              >
                <Loader/>
              </button>
            </form>}
            {!(loading || !templateSet) && <div className='flex'>
              <form className="relative flex flex-row">
                <input
                  type="text"
                  value={userPrompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                  }}
                  placeholder="Add more instructions..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                <button
                  type="submit"
                  onClick={async () => {
                    const newMessage = {
                      role: "user" as "user",
                      content: userPrompt
                    };

                    setLoading(true);
                    const stepsResponse = await axios.post(`${BACKEND_URL}/chat`, {
                      messages: [...llmMessages, newMessage]
                    });
                    setLoading(false);

                    setLlmMessages(x => [...x, newMessage]);
                    setLlmMessages(x => [...x, {
                      role: "assistant",
                      content: stepsResponse.data.response
                    }]);

                    setSteps(s => [...s, ...parseXml(stepsResponse.data.response).map(x => ({
                      ...x,
                      status: "pending" as "pending"
                    }))]);

                    setPrompt("");
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-blue-500/50 text-white rounded-full p-2 transition-all hover:bg-blue-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>}
          </div>
        </div>

        {/* Code and Preview Section */}
        <div className="w-[80%] bg-white/5 rounded-lg border border-white/10">
          <div className="border-b border-white/10">
            <div className="flex">
              <button
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-2 px-4 py-3 border-r border-white/10 ${activeTab === 'code' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'
                  }`}
              >
                <Code2 className="w-4 h-4" />
                Code
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-2 px-4 py-3 border-r border-white/10 ${activeTab === 'preview' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'
                  }`}
              >
                <Play className="w-4 h-4" />
                Preview
              </button>
            </div>
          </div>

          <div className="h-[93%]">
            {activeTab === 'code' ? (
              <div className="flex h-full">
                <div className="w-auto border-r border-white/10 p-2">
                  <FileExplorer
                    files={files}
                    onFileSelect={setSelectedFile}
                  />
                </div>

                {/* Editor Area */}
                <div className="flex-1 py-2 w-auto">
                  <CodeEditor file={selectedFile} />
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white h-full w-full"
              >
                <PreviewFrame webContainer={webcontainer} files={files} />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}