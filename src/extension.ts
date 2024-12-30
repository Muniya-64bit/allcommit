import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import util from 'util';
import { setCommitReminder, calculate_score, generateComments, generateDescription, changeDescriptionLanguage, commitAndPushChanges, selectBranch, } from './fucntions';


export let lastCommitTime: Date | null = null;

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
				lastCommitTime = new Date();
				setCommitReminder();
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
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
		if (!workspaceRoot) {
			vscode.window.showErrorMessage('No workspace folder is open');
			return;
		}
	
		try {
			// Fetch remote branches to ensure the latest branches are available locally
			await execPromise('git fetch --all', { cwd: workspaceRoot });
	
			// Get the list of branches (local and remote)
			const { stdout } = await execPromise('git branch -a', { cwd: workspaceRoot });
			const branches = stdout
				.split('\n')
				.map(branch => branch.trim().replace(/^\*\s*/, '')) // Remove '*' from the current branch
				.filter(branch => branch);
	
			// Show the list of branches and prompt the user to select one
			const selectedBranch = await vscode.window.showQuickPick(branches, {
				placeHolder: 'Select a branch to push to',
			});
	
			if (!selectedBranch) {
				vscode.window.showErrorMessage('Branch selection is required to push changes');
				return;
			}
	
			try {
				// If the branch is remote (e.g., "remotes/origin/branch-name"), switch to the local equivalent
				const cleanedBranch = selectedBranch.replace(/^remotes\/origin\//, '');
	
				// Create and switch to the branch locally if it doesn’t exist
				await execPromise(`git switch ${cleanedBranch} || git checkout -b ${cleanedBranch} origin/${cleanedBranch}`, {
					cwd: workspaceRoot,
				});
	
				// Push changes
				await execPromise(`git push origin ${cleanedBranch}`, { cwd: workspaceRoot });
	
				// Show success message
				vscode.window.showInformationMessage(`Changes pushed to branch ${cleanedBranch} successfully`);
			} catch (error) {
				console.error('Error pushing changes:', error);
				vscode.window.showErrorMessage(`Error pushing changes: ${(error as any).message || 'Unknown error'}`);
			}
		} catch (error) {
			console.error('Error fetching branches:', error);
			vscode.window.showErrorMessage('Error fetching branches');
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

	const pullDisposable = vscode.commands.registerCommand('allcommit.pull', async () => {
		const workspaceRoot = vscode.workspace.rootPath || '';
	
		try {
			// Fetch remote branches to ensure the latest branches are available locally
			await execPromise('git fetch --all', { cwd: workspaceRoot });
	
			// Get the list of branches (local and remote)
			const { stdout } = await execPromise('git branch -a', { cwd: workspaceRoot });
			const branches = stdout
				.split('\n')
				.map(branch => branch.trim().replace(/^\*\s*/, '')) // Remove '*' from the current branch
				.filter(branch => branch);
	
			// Show the list of branches and prompt the user to select one
			const selectedBranch = await vscode.window.showQuickPick(branches, {
				placeHolder: 'Select a branch to pull from',
			});
	
			if (!selectedBranch) {
				vscode.window.showErrorMessage('Branch selection is required to pull changes');
				return;
			}
	
			try {
				// If the branch is remote (e.g., "remotes/origin/branch-name"), switch to the local equivalent
				const localBranch = selectedBranch.replace('remotes/origin/', '');
				await execPromise(`git checkout ${localBranch}`, { cwd: workspaceRoot });
				// Proceed with pulling changes
				await execPromise(`git pull origin ${localBranch}`, { cwd: workspaceRoot });
				// Show success message
				vscode.window.showInformationMessage(`Changes pulled from branch ${localBranch} successfully`);
			} catch (error) {
				const errorMessage = (error as any).message || 'Unknown error';
				vscode.window.showErrorMessage(`Error pulling changes: ${errorMessage}`);
			}
		} catch (error) {
			vscode.window.showErrorMessage('Error pulling changes');
			console.error('Error pulling changes:', error);
		}
	});
	
	context.subscriptions.push(helloWorldDisposable, saveCommitDisposable, pushDisposable, addCommentDisposable, pullDisposable);

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

		const score = await calculate_score(fileContent);
		if (score === null) {
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



