import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import util from 'util';

import {calculate_score,generateComments,generateDescription,changeDescriptionLanguage,commitAndPushChanges, selectBranch,} from './fucntions';
dotenv.config();
const execPromise = util.promisify(exec);
export let changes: { [key: string]: string[] } = {};
export function clearChanges() {
    console.log('Clearing changes:', changes);
    changes = {};
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "All Commit" is now active!');

    const helloWorldDisposable = vscode.commands.registerCommand('allcommit.helloWorld', () => {
        const currentTime = new Date().toLocaleTimeString();
        vscode.window.showInformationMessage('Welcome to All Commit!\nCurrent time: ' + currentTime);
    });

    const saveCommitDisposable = vscode.commands.registerCommand('allcommit.saveCommit', async () => {
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

        const commitInfo = `Commit ID: ${commitId}\nDate-Time: ${currentTime}\n`;

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

        const workspaceRoot = vscode.workspace.rootPath || '';

        try {
            // Stage all changes
            await execPromise('git add .', { cwd: workspaceRoot });

            // Commit changes with generated description
            await execPromise(`git commit -m "${commitDescription}"`, { cwd: workspaceRoot });

            // Push changes to the repository
            

            vscode.window.showInformationMessage('Changes committed and pushed successfully');
        } catch (error) {
            vscode.window.showErrorMessage('Error committing and pushing changes');
            console.error('Error committing and pushing changes:', error);
        }
    });

    const pushDisposable = vscode.commands.registerCommand('allcommit.push', async () => {
        const workspaceRoot = vscode.workspace.rootPath || '';

        try {
            // Push changes to the repository
            await execPromise('git push', { cwd: workspaceRoot });

            vscode.window.showInformationMessage('Changes pushed successfully');
            console.log('Changes pushed successfully');
        } catch (error) {
            vscode.window.showErrorMessage('Error pushing changes');
            console.error('Error pushing changes:', error);
        }
    });

    const addCommentDisposable = vscode.commands.registerCommand('allcommit.addComment', async () => {
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

    const selectBranchCommand = vscode.commands.registerCommand('allcommit.selectBranch', async () => {
        const branchName = await vscode.window.showInputBox({ prompt: 'Enter branch name' });
        if (branchName) {
            await selectBranch(branchName);
        }
    });

    const changeLanguageCommand = vscode.commands.registerCommand('allcommit.changeDescriptionLanguage', async () => {
        const language = await vscode.window.showInputBox({ prompt: 'Enter language code (e.g., en, es, fr)' });
        if (language) {
            changeDescriptionLanguage(language);
        }
    });

    let commitAndPushCommand = vscode.commands.registerCommand('extension.commitAndPushChanges', async () => {
        await commitAndPushChanges();
    });

	const codereviewdisposable = vscode.commands.registerCommand('allcommit.codereview', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showErrorMessage('No active editor found');
			return;
		}

		const document = activeEditor.document;
		const fileContent = document.getText();

        const score: number = await calculate_score(fileContent);
		if (!score) {
			vscode.window.showErrorMessage('Failed to generate score');
			return;
		}

        vscode.window.showInformationMessage(`Code reviews added successfully. Score is ${score}`);
	});

    context.subscriptions.push(selectBranchCommand);
    context.subscriptions.push(changeLanguageCommand);
    context.subscriptions.push(commitAndPushCommand);
	context.subscriptions.push(codereviewdisposable);
}



