var Task = require('../models/task');
var User = require('../models/user');

module.exports = function (router) {
  
  // GET /api/tasks - Get all tasks
  router.route('/tasks')
    .get(function (req, res) {
      try {
        // Parse query parameters
        var whereQuery = req.query.where ? JSON.parse(req.query.where) : {};
        var sortQuery = req.query.sort ? JSON.parse(req.query.sort) : {};
        var selectQuery = req.query.select ? JSON.parse(req.query.select) : {};
        var skipNum = req.query.skip ? parseInt(req.query.skip) : 0;
        var limitNum = req.query.limit ? parseInt(req.query.limit) : 100; // default 100 for tasks
        var countOnly = req.query.count === 'true';

        // If count is requested
        if (countOnly) {
          Task.countDocuments(whereQuery)
            .then(count => {
              res.status(200).json({
                message: "OK",
                data: count
              });
            })
            .catch(err => {
              res.status(500).json({
                message: "Error counting tasks",
                data: {}
              });
            });
        } else {
          // Build query
          var query = Task.find(whereQuery);
          
          if (Object.keys(sortQuery).length > 0) {
            query = query.sort(sortQuery);
          }
          if (Object.keys(selectQuery).length > 0) {
            query = query.select(selectQuery);
          }
          if (skipNum > 0) {
            query = query.skip(skipNum);
          }
          if (limitNum > 0) {
            query = query.limit(limitNum);
          }

          query.exec()
            .then(tasks => {
              res.status(200).json({
                message: "OK",
                data: tasks
              });
            })
            .catch(err => {
              res.status(500).json({
                message: "Error retrieving tasks",
                data: {}
              });
            });
        }
      } catch (err) {
        res.status(400).json({
          message: "Bad request - invalid query parameters",
          data: {}
        });
      }
    })
    // POST /api/tasks - Create a new task
    .post(async function (req, res) {
      try {
        // Validate required fields
        if (!req.body.name || !req.body.deadline) {
          return res.status(400).json({
            message: "Name and deadline are required",
            data: {}
          });
        }

        var task = new Task();
        task.name = req.body.name;
        task.description = req.body.description || "";
        task.deadline = req.body.deadline;
        task.completed = req.body.completed !== undefined ? req.body.completed : false;
        task.assignedUser = req.body.assignedUser || "";
        task.assignedUserName = req.body.assignedUserName || "unassigned";
        
        const savedTask = await task.save();

        // Two-way reference: Add task to user's pendingTasks if assigned and not completed
        if (savedTask.assignedUser && savedTask.assignedUser !== "" && !savedTask.completed) {
          await User.findByIdAndUpdate(
            savedTask.assignedUser,
            { $addToSet: { pendingTasks: savedTask._id.toString() } }
          );
        }

        res.status(201).json({
          message: "Task created",
          data: savedTask
        });
      } catch (err) {
        res.status(500).json({
          message: "Error creating task",
          data: {}
        });
      }
    });

  // GET /api/tasks/:id - Get a specific task
  router.route('/tasks/:id')
    .get(function (req, res) {
      try {
        var selectQuery = req.query.select ? JSON.parse(req.query.select) : {};
        
        var query = Task.findById(req.params.id);
        
        if (Object.keys(selectQuery).length > 0) {
          query = query.select(selectQuery);
        }

        query.exec()
          .then(task => {
            if (!task) {
              return res.status(404).json({
                message: "Task not found",
                data: {}
              });
            }
            res.status(200).json({
              message: "OK",
              data: task
            });
          })
          .catch(err => {
            res.status(404).json({
              message: "Task not found",
              data: {}
            });
          });
      } catch (err) {
        res.status(400).json({
          message: "Bad request - invalid query parameters",
          data: {}
        });
      }
    })
    // PUT /api/tasks/:id - Replace entire task
    .put(async function (req, res) {
      try {
        // Validate required fields
        if (!req.body.name || !req.body.deadline) {
          return res.status(400).json({
            message: "Name and deadline are required",
            data: {}
          });
        }

        // Find the existing task
        const existingTask = await Task.findById(req.params.id);
        
        if (!existingTask) {
          return res.status(404).json({
            message: "Task not found",
            data: {}
          });
        }

        // Store old assignedUser
        const oldAssignedUser = existingTask.assignedUser;
        const newAssignedUser = req.body.assignedUser || "";

        // Update task
        existingTask.name = req.body.name;
        existingTask.description = req.body.description || "";
        existingTask.deadline = req.body.deadline;
        existingTask.completed = req.body.completed !== undefined ? req.body.completed : false;
        existingTask.assignedUser = newAssignedUser;
        existingTask.assignedUserName = req.body.assignedUserName || "unassigned";

        const updatedTask = await existingTask.save();

        // Handle two-way reference for assignedUser changes
        // Only update if task is not completed and assignedUser changed
        if (oldAssignedUser !== newAssignedUser) {
          // Remove task from old user's pendingTasks
          if (oldAssignedUser && oldAssignedUser !== "") {
            await User.findByIdAndUpdate(
              oldAssignedUser,
              { $pull: { pendingTasks: req.params.id } }
            );
          }

          // Add task to new user's pendingTasks (only if not completed)
          if (newAssignedUser && newAssignedUser !== "" && !updatedTask.completed) {
            await User.findByIdAndUpdate(
              newAssignedUser,
              { $addToSet: { pendingTasks: req.params.id } }
            );
          }
        } else if (oldAssignedUser && oldAssignedUser !== "") {
          // If assignedUser didn't change but task is now completed, remove from pendingTasks
          if (updatedTask.completed && !existingTask.completed) {
            await User.findByIdAndUpdate(
              oldAssignedUser,
              { $pull: { pendingTasks: req.params.id } }
            );
          }
          // If task was completed but now is not completed, add back to pendingTasks
          else if (!updatedTask.completed && existingTask.completed) {
            await User.findByIdAndUpdate(
              oldAssignedUser,
              { $addToSet: { pendingTasks: req.params.id } }
            );
          }
        }

        res.status(200).json({
          message: "Task updated",
          data: updatedTask
        });

      } catch (err) {
        if (err.kind === 'ObjectId') {
          res.status(404).json({
            message: "Task not found",
            data: {}
          });
        } else {
          res.status(500).json({
            message: "Error updating task",
            data: {}
          });
        }
      }
    })
    // DELETE /api/tasks/:id - Delete task
    .delete(async function (req, res) {
      try {
        const task = await Task.findById(req.params.id);
        
        if (!task) {
          return res.status(404).json({
            message: "Task not found",
            data: {}
          });
        }

        // Remove task from assignedUser's pendingTasks (two-way reference)
        if (task.assignedUser && task.assignedUser !== "") {
          await User.findByIdAndUpdate(
            task.assignedUser,
            { $pull: { pendingTasks: req.params.id } }
          );
        }

        await Task.findByIdAndDelete(req.params.id);

        res.status(200).json({
          message: "Task deleted",
          data: task
        });

      } catch (err) {
        if (err.kind === 'ObjectId') {
          res.status(404).json({
            message: "Task not found",
            data: {}
          });
        } else {
          res.status(500).json({
            message: "Error deleting task",
            data: {}
          });
        }
      }
    });

  return router;
};

