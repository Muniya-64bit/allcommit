import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

let changes: { [key: string]: string[] } = {};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "gitai" is now active!');

    const helloWorldDisposable = vscode.commands.registerCommand('gitai.helloWorld', () => {
        const currentTime = new Date().toLocaleTimeString();
        vscode.window.showInformationMessage('Welcome to gitai!\nCurrent time: ' + currentTime);
    });

    const saveCommitDisposable = vscode.commands.registerCommand('gitai.saveCommit', async () => {
        if (Object.keys(changes).length === 0) {
            vscode.window.showInformationMessage('There is nothing to commit');
            return;
        }

        const commitDescription = await generateDescription();
        if (!commitDescription) {
            vscode.window.showErrorMessage('Failed to generate commit description');
            return;
        }

        const currentTime = new Date().toLocaleString();
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const fileName = path.basename(activeEditor.document.fileName);
        const fileType = path.extname(activeEditor.document.fileName);
        const commitId = uuidv4();

        const commitInfo = `Commit ID: ${commitId}\nDescription: ${commitDescription}\nDate-Time: ${currentTime}\nFile Name: ${fileName}\nFile Type: ${fileType}\nPushed: false\n\n`;

        const commitLogPath = path.join(vscode.workspace.rootPath || '', 'commit_log.txt');
        fs.appendFile(commitLogPath, commitInfo, (err) => { // Append to the file instead of overwriting
            if (err) {
                vscode.window.showErrorMessage('Failed to save commit information');
                console.error(err);
            } else {
                vscode.window.showInformationMessage('Commit information saved successfully');
                clearChanges();
            }
        });
    });

    const pushDisposable = vscode.commands.registerCommand('gitai.push', async () => {
        const commitLogPath = path.join(vscode.workspace.rootPath || '', 'commit_log.txt');
        const pushLogPath = path.join(vscode.workspace.rootPath || '', 'push_log.txt');
        if (!fs.existsSync(commitLogPath)) {
            vscode.window.showErrorMessage('No commit log found to push');
            return;
        }

        const commitLog = fs.readFileSync(commitLogPath, 'utf-8');
        const commits = commitLog.split('\n\n').filter(commit => commit && !commit.includes('Pushed: true'));

        if (commits.length === 0) {
            vscode.window.showInformationMessage('No new commits to push');
            return;
        }

        // Simulate pushing commits
        for (const commit of commits) {
            console.log('Pushing commit:', commit);
            // Here you would add the actual push logic, e.g., using a git library or API
        }

        // Mark commits as pushed and generate push log entries
        const updatedCommitLog = commitLog.replace(/(Commit ID: .+?)(\nPushed: false)/g, '$1\nPushed: true');
        fs.writeFile(commitLogPath, updatedCommitLog, (err) => {
            if (err) {
                vscode.window.showErrorMessage('Failed to update commit log');
                console.error(err);
            } else {
                vscode.window.showInformationMessage('Commits pushed and log updated successfully');
            }
        });

        const pushLogEntries = commits.map(commit => {
            const commitIdMatch = commit.match(/Commit ID: (.+)/);
            const commitId = commitIdMatch ? commitIdMatch[1] : 'Unknown ID';
            const currentTime = new Date().toLocaleString();
            return `Commit ID: ${commitId}\nPushed Time: ${currentTime}\n\n`;
        });

        // Append pushed commit IDs and times to push_log.txt
        fs.appendFile(pushLogPath, pushLogEntries.join(''), (err) => {
            if (err) {
                vscode.window.showErrorMessage('Failed to update push log');
                console.error(err);
            } else {
                vscode.window.showInformationMessage('Push log updated successfully');
            }
        });
    });

    const addCommentDisposable = vscode.commands.registerCommand('gitai.addComment', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const document = activeEditor.document;
        const fileContent = document.getText();

        const comments = await generateComments(fileContent);
        if (!comments) {
            vscode.window.showErrorMessage('Failed to generate comments');
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        const lines = comments.split('\n');
        lines.forEach((line, index) => {
            const position = new vscode.Position(index, 0);
            edit.insert(document.uri, position, line + '\n');
        });

        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage('Comments added successfully');
    });

    context.subscriptions.push(helloWorldDisposable, saveCommitDisposable, pushDisposable, addCommentDisposable);

    // Track changes in files
    vscode.workspace.onDidChangeTextDocument(event => {
        const fileName = event.document.fileName;
        if (!changes[fileName]) {
            changes[fileName] = [];
        }
        event.contentChanges.forEach(change => {
            changes[fileName].push(change.text);
        });
        console.log(`Tracked changes for ${fileName}:`, changes[fileName]);
    });
}

async function generateDescription(): Promise<string | null> {
    const changesDescription = description_writer();
    const prompt = `Generate a professional commit description with overall content mention based on the following changes:\n${changesDescription}\nDescription:`;

    try {
        const response = await axios.post('https://api.openai.com/v1/completions', {
            model: "gpt-3.5-turbo-instruct",
            prompt: prompt,
            max_tokens: 50,
            temperature: 0.7,
        }, {
            headers: {
'Authorization': `Bearer ${process.env['OPEN_AI']}`            }
        });

        const description = (response.data as any).choices[0].text.trim();
        return description;
    } catch (error) {
        console.error('Error generating description:', error);
        return null;
    }
}

async function generateComments(fileContent: string): Promise<string | null> {
    const prompt = `Add comments to the following code:\n${fileContent}\nComments:`;

    try {
        const response = await axios.post('https://api.openai.com/v1/completions', {
            model: "gpt-3.5-turbo-instruct",
            prompt: prompt,
            max_tokens: 150,
            temperature: 0.7,
        }, {
            headers: {
'Authorization': `Bearer ${process.env['OPEN_AI']}`            }
        });

        const comments = (response.data as any).choices[0].text.trim();
        return comments;
    } catch (error) {
        console.error('Error generating comments:', error);
        return null;
    }
}

export function description_writer() {
    let description = 'Changes made:\n';
    for (const fileName in changes) {
        description += `File: ${fileName}\nChanges:\n`;
        changes[fileName].forEach(change => {
            description += `${change}\n`;
        });
        description += '\n';
    }
    console.log('Generated description:', description);
    return description;
}

function clearChanges() {
    console.log('Clearing changes:', changes);
    changes = {};
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log('Bye, your extension "gitai" is now deactive!');
}
